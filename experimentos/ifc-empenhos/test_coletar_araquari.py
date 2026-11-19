import io
import json
import unittest
from datetime import datetime, timezone
from decimal import Decimal
import coletar_araquari as m

class TestCollector(unittest.TestCase):
 def test_correct_columns(self):
  headers=['Ano e mês do lançamento','Código Unidade Gestora','Valor Empenhado (R$)']
  self.assertEqual(m.select_columns(headers),(headers[1], headers[2],headers[0]))
 def test_missing_column_rejected(self):
  with self.assertRaises(ValueError): m.select_columns(['Código Unidade Gestora','Valor Pago (R$)'])
 def test_negative_movements_and_month_filter(self):
  csv='Ano e mês do lançamento;Código Unidade Gestora;Valor Empenhado (R$)\n2025/12;158459;1.200,30\n2025/12;158459;-200,10\n2025/12;158460;55,00\n'
  total,rows=m.sum_monthly_csv(io.BytesIO(csv.encode('latin-1')),'202512')
  self.assertEqual(total,Decimal('1000.20'));self.assertEqual(rows,2)
 def test_wrong_period_rejected(self):
  csv='Ano e mês do lançamento;Código Unidade Gestora;Valor Empenhado (R$)\n2025/11;158459;200,00\n'
  with self.assertRaises(ValueError): m.sum_monthly_csv(io.BytesIO(csv.encode('latin-1')),'202512')
 def test_correction_exact(self):
  self.assertEqual(m.corrected({'mes':'202512','valor':100},{'202512':Decimal(100),'202610':Decimal(120)},'202610'),120)
 def test_incomplete_annual_not_published(self):
  now=datetime(2026,11,19,tzinfo=timezone.utc)
  data=m.prepare_result({'202501':{'valor':10,'registros':1}}, {'IPCA':{'202501':Decimal(100),'202610':Decimal(110)},'INPC':{'202501':Decimal(100),'202610':Decimal(110)}}, {}, now)
  entry=next(r for r in data['anos'] if r['year']==2025)
  self.assertEqual(entry['status'],'incompleto');self.assertIsNone(entry['nominal']);self.assertIsNone(entry['ipca'])
 def test_full_year_and_monthly_correction(self):
  now=datetime(2026,11,19,tzinfo=timezone.utc)
  months={f'2025{i:02d}':{'valor':100,'registros':1} for i in range(1,13)}
  index={f'2025{i:02d}':Decimal(100) for i in range(1,13)};index['202610']=Decimal(120)
  doc=m.prepare_result(months, {'IPCA':index,'INPC':index}, {}, now)
  row=next(r for r in doc['anos'] if r['year']==2025)
  self.assertEqual(row['status'],'ok');self.assertEqual(row['nominal'],1200);self.assertEqual(row['ipca'],1440)
  self.assertIn('\"nominal\": 1200.0',json.dumps(doc,indent=2))
 def test_no_new_data_does_not_force_deploy(self):
  old={'schema_version':1, 'gerado_em':'2026-11-19T00:00:00Z', 'cgu':{'falhas_consulta':[{'mes':'202311'}], 'meses_coletados':2}, 'meses':{'202501':{'valor':2}}, 'anos':[]}
  new={**old,'gerado_em':'2026-11-19T12:00:00Z','cgu':{**old['cgu'],'falhas_consulta':[]}}
  self.assertFalse(m.materially_changed(old,new))
  new['meses']={'202501':{'valor':3}}
  self.assertTrue(m.materially_changed(old,new))
 def test_http_retry_429_then_succeeds(self):
  from unittest.mock import patch
  from urllib.error import HTTPError
  calls=[]
  def simulated(_month):
   calls.append(1)
   if len(calls)==1: raise HTTPError('https://example.invalid',429,'limite',{},None)
   return {'valor':123,'registros':1}
  with patch.object(m,'_download_month_once',side_effect=simulated),patch.object(m.time,'sleep') as sleeper:
   self.assertEqual(m.download_month('202501')['valor'],123)
  self.assertEqual(len(calls),2);self.assertEqual(sleeper.call_count,1)
 def test_http_404_not_retried(self):
  from unittest.mock import patch
  from urllib.error import HTTPError
  with patch.object(m,'_download_month_once',side_effect=HTTPError('https://example.invalid',404,'nao existe',{},None)) as method:
   with self.assertRaises(HTTPError): m.download_month('201301')
   self.assertEqual(method.call_count,1)
 def test_older_year_without_source_not_zero(self):
  now=datetime(2026,11,19,tzinfo=timezone.utc)
  doc=m.prepare_result({}, {'IPCA':{},'INPC':{}},{},now)
  row=doc['anos'][0]
  self.assertEqual(row['status'],'sem_fonte');self.assertIsNone(row['nominal'])

if __name__=='__main__': unittest.main()