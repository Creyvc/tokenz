"""Portable HTML reports without scripts, remote assets or unescaped model output."""
from html import escape

from app.study import result_rows, summary_text


def html_report(study):
    body = []
    for line in summary_text(study).splitlines():
        if line.startswith('# '):
            body.append('<h1>' + escape(line[2:]) + '</h1>')
        elif line.startswith('## '):
            body.append('<h2>' + escape(line[3:]) + '</h2>')
        elif line:
            body.append('<p>' + escape(line.replace('**', '')) + '</p>')
    table = result_rows(study)
    if table:
        headers = list(table[0])
        body += ['<h2>Comparison table</h2><div class="table"><table><thead><tr>',
                 ''.join('<th>' + escape(h) + '</th>' for h in headers), '</tr></thead><tbody>']
        for row in table:
            body.append('<tr>' + ''.join('<td>' + escape('Not measured' if row[h] is None else
                                                        f'{row[h]:.2f}' if isinstance(row[h], float) else str(row[h]))
                                         + '</td>' for h in headers) + '</tr>')
        body += ['</tbody></table></div>']
    body.append('<h2>Prompts and answers</h2>')
    for row in study['experiments']:
        body.append('<details><summary>' + escape(row['prompt_id'] + ' · ' + row['target_model']) + '</summary>')
        for label, text in [('Original prompt', row['original_prompt']), ('Shortened prompt', row.get('optimized_prompt')),
                            ('Original answer', row.get('baseline', {}).get('text')),
                            ('Answer after shortening', row.get('optimized_response', {}).get('text'))]:
            body.append('<h3>' + label + '</h3><pre>' + escape(text or 'Not returned') + '</pre>')
        body.append('</details>')
    return '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tokenz comparison report</title><style>
body{font:16px/1.6 system-ui,sans-serif;max-width:1100px;margin:40px auto;padding:0 24px;color:#172033;background:#f4f7fc}
h1{font-size:36px;letter-spacing:-1px}h2{margin-top:36px;color:#2450ac}p{margin:10px 0}
.table{overflow:auto}table{border-collapse:collapse;width:100%;background:white;font-size:14px}
th,td{padding:12px;text-align:left;border-bottom:1px solid #dae1ee}th{background:#e7eefb}
details{background:white;border:1px solid #d4ddec;border-radius:12px;padding:16px;margin:16px 0}
summary{cursor:pointer;font-weight:600}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.6 system-ui}
@media print{body{background:white;margin:0}details{break-inside:avoid}}
</style><main>''' + ''.join(body) + '</main></html>'
