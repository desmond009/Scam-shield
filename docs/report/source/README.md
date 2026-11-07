# Report source

`../ScamShield_Project_Report.pdf` is built from these files.

- `ch/*.html`: the chapters, in file-name order. `<c>key</c>` cites a reference from `refs.py`. Chapters, sections, figures, tables and citations are numbered automatically.
- `front.html`: title page, certificate, declaration, acknowledgement, abstract and abbreviations. The table of contents and the lists of figures and tables are generated.
- `fig/`: charts (from `charts*.py`, which read `services/ml/models/gbm-20261014-074524/evaluation.json`) and cropped screenshots (from `crop.py`).
- Boxes marked **TEAM TO COMPLETE** (`<div class="todo">`) need real data before submission: the survey results, the UAT feedback and the team roles.

## Rebuild

```bash
npm i playwright-core@1.56.1 mermaid@11.4.1      # in this folder
python3 -m venv .venv && .venv/bin/pip install pypdf beautifulsoup4 matplotlib
npx playwright install chromium                  # then set the executablePath in render.mjs to that Chromium
.venv/bin/python build.py                        # writes ScamShield_Project_Report.pdf here
```
