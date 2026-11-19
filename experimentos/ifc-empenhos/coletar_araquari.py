"""Coleta incremental de empenhos da UG 158459: arquivos oficiais CGU + SIDRA.

Isolado do Tesouro Gerencial. Em falha, conserva valores oficiais já conferidos.
Não grava documentos individuais, somente agregados mensais por UG.
"""
from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import io
import json
import os
from pathlib import Path
import tempfile
import time
import unicodedata
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from zipfile import BadZipFile, ZipFile

BASE = "https://dadosabertos-download.cgu.gov.br/PortalDaTransparencia/saida/despesas-execucao"
SIDRA = {
    "IPCA": "https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/2266/p/all",
    "INPC": "https://apisidra.ibge.gov.br/values/t/1736/n1/all/v/2289/p/all",
}
UG = "158459"
START_YEAR = 2014  # Arquivos CGU 201301 e 201312: HTTP 403; arquivo 201401: HTTP 200.
MAX_WORK_SECONDS = 21 * 60
MAX_ZIP_BYTES = 128 * 1024 * 1024
HERE = Path(__file__).resolve().parent
DEST = HERE / "dados-araquari.json"
CENTS = Decimal("0.01")


def normalized(value: str) -> str:
    return "".join(ch for ch in unicodedata.normalize("NFKD", value or "") if not unicodedata.combining(ch)).strip().lower()


def decimal_br(value: object) -> Decimal:
    raw = str(value or "").strip().replace(".", "").replace(",", ".")
    if not raw or raw in {"-", "...", "X"}:
        raise ValueError("valor financeiro ausente")
    try:
        amount = Decimal(raw)
    except InvalidOperation as exc:
        raise ValueError("valor financeiro invalido") from exc
    if not amount.is_finite():
        raise ValueError("valor financeiro nao finito")
    return amount


def select_columns(columns: list[str]) -> tuple[str, str, str]:
    by_name = {normalized(c): c for c in columns}
    keys = ("codigo unidade gestora", "valor empenhado (r$)", "ano e mes do lancamento")
    if not all(k in by_name for k in keys):
        raise ValueError("schema CGU alterado; faltam campos de UG, empenho ou competencia")
    return tuple(by_name[k] for k in keys)


def sum_monthly_csv(stream, month: str) -> tuple[Decimal, int]:
    reader = csv.DictReader(io.TextIOWrapper(stream, encoding="latin-1", newline=""), delimiter=";")
    col_ug, col_value, col_period = select_columns(reader.fieldnames or [])
    total, matched = Decimal(0), 0
    for row in reader:
        if (row.get(col_ug) or "").strip() != UG:
            continue
        period = (row.get(col_period) or "").strip().replace("/", "").replace("-", "")
        if period != month:
            raise ValueError(f"competencia inesperada no arquivo {month}")
        total += decimal_br(row.get(col_value))
        matched += 1
    return total, matched


def _download_month_once(month: str) -> dict:
    url = f"{BASE}/{month}_Despesas.zip"
    request = Request(url, headers={"User-Agent": "IFC-Araquari-Aggregated-Expense/1.0", "Accept": "application/zip"})
    with tempfile.TemporaryDirectory() as folder:
        file_path = Path(folder) / "archive.zip"
        size = 0
        with urlopen(request, timeout=90) as response, file_path.open("wb") as output:
            length = int(response.headers.get("Content-Length") or 0)
            if length > MAX_ZIP_BYTES:
                raise ValueError("arquivo CGU supera tamanho maximo")
            while chunk := response.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_ZIP_BYTES:
                    raise ValueError("arquivo CGU supera tamanho maximo")
                output.write(chunk)
        with ZipFile(file_path) as archive:
            members = [i for i in archive.infolist() if i.filename.lower().endswith(".csv") and not i.is_dir()]
            if len(members) != 1 or members[0].file_size > 850 * 1024 * 1024:
                raise ValueError("ZIP CGU com estrutura ou tamanho inesperado")
            with archive.open(members[0]) as csv_file:
                total, rows = sum_monthly_csv(csv_file, month)
    return {"valor": float(total.quantize(CENTS, rounding=ROUND_HALF_UP)), "registros": rows, "fonte": url}


def download_month(month: str) -> dict:
    # O servico publica arquivos grandes e pode limitar downloads consecutivos.
    # Nao confundir limite temporario com ausencia de empenhos.
    for attempt in range(3):
        try:
            return _download_month_once(month)
        except HTTPError as exc:
            if exc.code not in {429, 500, 502, 503, 504} or attempt == 2:
                raise
            retry_after = (exc.headers or {}).get('Retry-After', '')
            try:
                delay = min(35.0, max(3.0, float(retry_after)))
            except ValueError:
                delay = 5.0 * (attempt + 1)
            print('CGU', month, 'HTTP', exc.code, 'tentativa', attempt + 1, 'pausa', round(delay), 's', flush=True)
            time.sleep(delay)
    raise RuntimeError('download CGU sem resultado apos tentativas')


def materially_changed(old: dict, current: dict) -> bool:
    """Evita commit e rebuild do Pages quando a coleta nao mudou."""
    if not old:
        return True
    def comparable(payload):
        copy = dict(payload)
        copy.pop('gerado_em', None)
        cgu = dict(copy.get('cgu') or {})
        cgu.pop('falhas_consulta', None)  # diagnosticos de rede sao transitorios
        copy['cgu'] = cgu
        return copy
    return comparable(old) != comparable(current)


def get_sidra(url: str) -> dict[str, Decimal]:
    req = Request(url, headers={"Accept": "application/json", "User-Agent": "IFC-Araquari-Aggregated-Expense/1.0"})
    with urlopen(req, timeout=60) as response:
        payload = json.load(response)
    if not isinstance(payload, list) or len(payload) < 2:
        raise ValueError("SIDRA sem linhas")
    result = {}
    for item in payload[1:]:
        periods = [str(v) for k,v in item.items() if k.startswith("D") and k.endswith("C") and len(str(v)) == 6 and str(v).isdigit() and str(v).startswith("20")]
        if len(periods) != 1:
            continue
        period = periods[0]
        value = Decimal(str(item.get("V") or "0").strip().replace(",", "."))
        if value <= 0:
            continue
        if period in result and result[period] != value:
            raise ValueError("SIDRA indice contraditorio")
        result[period] = value
    if "201312" not in result:
        raise ValueError("SIDRA sem indexador dezembro/2013")
    return result


def corrected(month_data: dict, indexes: dict[str, Decimal], target: str) -> float | None:
    if not month_data or target not in indexes:
        return None
    amount = Decimal(str(month_data["valor"]))
    period = month_data["mes"]
    if period not in indexes:
        return None
    return float((amount * indexes[target] / indexes[period]).quantize(CENTS, rounding=ROUND_HALF_UP))


def prepare_result(months: dict, indices: dict, previous: dict, now: datetime) -> dict:
    last = {name: max(series) if series else None for name,series in indices.items()}
    reference = min(last.values()) if all(last.values()) else None
    rows = []
    for year in range(2009, now.year + 1):
        if year < START_YEAR:
            rows.append({"year": year, "status": "sem_fonte", "nominal": None, "ipca": None, "inpc": None, "meses": 0})
            continue
        expected = [f"{year}{m:02d}" for m in range(1, 13 if year < now.year else now.month)]
        valid = [dict(months[x], mes=x) for x in expected if x in months]
        complete = len(valid) == len(expected)
        partial_year = year == now.year
        nominal = float(round(sum(Decimal(str(x["valor"])) for x in valid), 2)) if (complete and valid) else None
        calc = {}
        for name, series in indices.items():
            vals = [corrected(x,series,reference) for x in valid] if reference else []
            calc[name.lower()] = round(sum(vals),2) if nominal is not None and vals and all(v is not None for v in vals) else None
        rows.append({"year":year,"status": "parcial" if complete and partial_year else "ok" if complete else "incompleto",
                     "nominal":nominal,"ipca":calc.get("ipca"),"inpc":calc.get("inpc"),
                     "meses":len(valid),"esperados":len(expected),"itens":sum(x["registros"] for x in valid),
                     "referencia":reference})
    return {"schema_version":1,"gerado_em":now.isoformat(),"unidade_gestora":UG,
            "criterio":"Movimentos mensais de Valor Empenhado da UG 158459, arquivos CGU de execucao da despesa",
            "cgu":{"fonte":BASE,"anos_ok":sum(x["status"] in {"ok","parcial"} for x in rows),
                   "meses_coletados":len(months),"primeiro_exercicio_coberto":START_YEAR,
                   "nota":"2009-2013: sem arquivo mensal de empenhos da UG equivalente, sem zeros inventados"},
            "sidra":{"referencia":reference,"ultima_competencia":last,
                     "status":{k:{"status":"ok" if indices[k] else "aguardando"} for k in SIDRA}},
            "meses":months,"anos":rows}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-months",type=int,default=180)
    parser.add_argument("--dry-run",action="store_true")
    args=parser.parse_args()
    if not 1 <= args.max_months <= 200:
        parser.error("max-months entre 1 e 200")
    started = time.monotonic()
    now=datetime.now(timezone.utc)
    old=json.loads(DEST.read_text(encoding="utf-8")) if DEST.exists() else {}
    cache=dict(old.get("meses") or {})
    # Priorizar anos fechados mais recentes, completando 2025, 2024, etc.
    # O ano corrente entra depois dos anos anteriores, sem apresentar soma incompleta como anual.
    years_order = [now.year, now.year - 1, now.year - 2] + list(range(START_YEAR, now.year - 2))
    available = [f"{year}{month:02d}" for year in years_order for month in range(1, (now.month if year == now.year else 13))]
    pending=[x for x in available if x not in cache][:args.max_months]
    print("CGU UG",UG,"meses ja armazenados",len(cache),"consultas desta execucao",len(pending),flush=True)
    failures=[]
    for i,month in enumerate(pending,1):
        if time.monotonic() - started >= MAX_WORK_SECONDS:
            print('LIMITE DE TEMPO: salvando progresso ja verificado; proximo lote retoma a coleta', flush=True)
            break
        try:
            cache[month]=download_month(month)
            print(f"CGU {month}: OK, registros UG={cache[month]['registros']}, valor={cache[month]['valor']}",flush=True)
            time.sleep(1.3)  # Menor pressao na fonte; processamento do Tesouro e independente.
        except Exception as exc:
            code = getattr(exc, 'code', None)
            failures.append({"mes": month, "tipo": type(exc).__name__, "http": code})
            print('CGU', month, 'FALHA', type(exc).__name__, 'HTTP', code or 'n/a', flush=True)
            if code in {403, 405, 429, 503}:
                # Na CGU, sequencias de HTTP 405 foram observadas depois de ~26 downloads validos.
                # Interromper o lote evita novas tentativas improdutivas.
                print('LIMITE OU BLOQUEIO DO SERVICO: lote encerrado, preservando meses verificados', flush=True)
                break
    indices={}
    for name,url in SIDRA.items():
        try:
            indices[name]=get_sidra(url)
            print("SIDRA",name,"competencias",len(indices[name]),flush=True)
        except Exception as exc:
            indices[name]={}
            print("SIDRA",name,"FALHA",type(exc).__name__,flush=True)
    doc=prepare_result(cache,indices,old,now)
    doc["cgu"]["falhas_consulta"] = failures[:30]
    if not any(x in doc["sidra"]["status"] and doc["sidra"]["status"][x]["status"]=="ok" for x in SIDRA):
        raise RuntimeError("Falha em ambos os indices SIDRA; nao atualizar arquivo")
    if not cache:
        raise RuntimeError("Nenhum mes CGU disponivel; nao substituir dados")
    if not materially_changed(old, doc):
        print('SEM ALTERACOES: cache e indice equivalentes; evitando commit no Pages', flush=True)
        return 0
    if not args.dry_run:
        temp=DEST.with_suffix(".tmp")
        temp.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        temp.replace(DEST)
    print("RESULTADO anos completos",doc["cgu"]["anos_ok"],"meses",len(cache),"referencia",doc["sidra"]["referencia"],"dry_run",args.dry_run,flush=True)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())