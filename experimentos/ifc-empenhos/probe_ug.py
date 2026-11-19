"""Diagnostico descartavel de arquivos publicos da CGU, sem tocar em producao."""
from __future__ import annotations

import csv
from decimal import Decimal, InvalidOperation
import io
import os
import json
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError
from pathlib import Path
import sys
import tempfile
import unicodedata
from urllib.request import Request, urlopen
from zipfile import ZipFile

BASE = "https://dadosabertos-download.cgu.gov.br/PortalDaTransparencia/saida/despesas-execucao"
PERIODS = ("201301", "201312", "201401", "201412", "201501", "201512", "201601", "201912", "202001", "202101", "202201", "202301", "202312", "202401", "202512", "202601", "202603", "202610")
UG = "158459"
LIMIT = 310 * 1024 * 1024


def norm(s):
    return "".join(c for c in unicodedata.normalize("NFKD", s or "") if not unicodedata.combining(c)).strip().lower()


def request(url, method="GET"):
    return Request(url, headers={"User-Agent": "IFC-Araquari-UG-Open-Data-Research/1.0", "Accept": "application/zip,*/*"}, method=method)


def probe_api():
    key = os.environ.get('CGU_API_KEY', '').strip()
    if not key:
        print('CGU API: secret CGU_API_KEY nao disponibilizado neste job', flush=True)
        return
    print('CGU API: credencial disponivel no ambiente; verificando o endpoint por UG', flush=True)
    for day in ('01/12/2025', '15/12/2025', '03/11/2026'):
        query = urlencode({'dataEmissao': day, 'fase': 1, 'unidadeGestora': UG, 'pagina': 1})
        url = 'https://api.portaldatransparencia.gov.br/api-de-dados/despesas/documentos?' + query
        req = Request(url, headers={'chave-api-dados': key, 'Accept': 'application/json', 'User-Agent': 'IFC-UG-Araquari-Research/1.0'})
        try:
            with urlopen(req, timeout=25) as resp:
                body = resp.read(1000000)
                decoded = json.loads(body)
                if isinstance(decoded, list):
                    keys = sorted(decoded[0].keys()) if decoded and isinstance(decoded[0], dict) else []
                    ugs = sorted(set(str(x.get('codigoUg','')) for x in decoded if isinstance(x,dict)))
                    print('CGU API', day, 'HTTP', resp.status, 'registros', len(decoded), 'ugs', ugs[:4], 'campos', keys[:35], flush=True)
                else:
                    print('CGU API', day, 'HTTP', resp.status, 'estrutura',type(decoded).__name__, 'campos',sorted(decoded.keys())[:20] if isinstance(decoded,dict) else '', flush=True)
        except HTTPError as exc:
            print('CGU API', day, 'HTTP', exc.code, 'sem divulgar resposta de erro', flush=True)
        except (URLError, TimeoutError, OSError, ValueError) as exc:
            print('CGU API', day, 'falha', type(exc).__name__, flush=True)


def main():
    probe_api()
    target = None
    for period in PERIODS:
        url = f"{BASE}/{period}_Despesas.zip"
        try:
            with urlopen(request(url, "HEAD"), timeout=25) as resp:
                size = int(resp.headers.get("Content-Length") or 0)
                print("PROBE", period, "HTTP", resp.status, "MB", round(size / 1e6, 2), "type", resp.headers.get("Content-Type"), flush=True)
                if not target and resp.status == 200 and (not size or size < LIMIT):
                    target = (period, url)
        except Exception as exc:
            print("PROBE", period, "FAIL", type(exc).__name__, "HTTP", getattr(exc, "code", "n/a"), str(exc)[:120], flush=True)
    if not target:
        print("No public source under size threshold");return 0
    period,url = target
    with tempfile.TemporaryDirectory() as directory:
        archive=Path(directory)/"sample.zip"
        total=0
        with urlopen(request(url), timeout=120) as source,archive.open("wb") as dest:
            while chunk := source.read(1024*1024):
                total+=len(chunk)
                if total>LIMIT: raise RuntimeError("ZIP above 310MiB limit")
                dest.write(chunk)
        print("DOWNLOADED",period,"bytes",total,flush=True)
        with ZipFile(archive) as z:
            names=[x for x in z.namelist() if x.lower().endswith('.csv')]
            print("ZIP MEMBERS", [(n,z.getinfo(n).file_size) for n in names[:7]],flush=True)
            for n in names[:2]:
                with z.open(n) as stream:
                    reader=csv.DictReader(io.TextIOWrapper(stream,encoding="latin-1",newline=""),delimiter=";")
                    headers=reader.fieldnames or []
                    print("CSV HEADERS",repr(headers[:55]),flush=True)
                    norm_headers={norm(v):v for v in headers}
                    ugcol=norm_headers.get('codigo unidade gestora')
                    valcol=norm_headers.get('valor empenhado (r$)')
                    periodcol=norm_headers.get('ano e mes do lancamento')
                    print("DETECT",ugcol,valcol,periodcol,flush=True)
                    if not ugcol or not valcol: continue
                    rows=0; found=0;totalvalue=Decimal(0); examples=[];periods=set()
                    for row in reader:
                        rows+=1
                        if str(row.get(ugcol,'')).strip()!=UG:continue
                        found+=1
                        if periodcol:periods.add(row.get(periodcol))
                        raw=(row.get(valcol,'') or '').strip().replace('.','').replace(',','.')
                        try:totalvalue+=Decimal(raw)
                        except InvalidOperation: print("BAD VAL",repr(raw),flush=True)
                        if len(examples)<2:examples.append({ugcol:row.get(ugcol),valcol:row.get(valcol),periodcol:row.get(periodcol)})
                    print("MATCHED",n,"total_rows",rows,"ug_rows",found,"empenhado_sum",totalvalue,"periods",sorted(periods)[:16],"examples",examples,flush=True)
    return 0

if __name__ == '__main__':
    sys.exit(main())