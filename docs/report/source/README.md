# Report source

`../ScamShield_Project_Report.pdf` is built from these files.

- `ch/*.html`: the chapters, in file-name order. `<c>key</c>` cites a reference from `refs.py`. Chapters, sections, figures, tables and citations are numbered automatically.
- `front.html`: title page, certificate, declaration, acknowledgement, abstract and abbreviations. The table of contents and the lists of figures and tables are generated.
- `fig/`: charts (from `charts*.py`, which read `services/ml/models/gbm-20261014-074524/evaluation.json`) and cropped screenshots (from `crop.py`).
- There are no placeholder boxes left. Survey results and user testing are described as not included; add them to ch/03 and ch/10 if you collect them.

## Rebuild

```bash
npm i playwright-core@1.56.1 mermaid@11.4.1      # in this folder
python3 -m venv .venv && .venv/bin/pip install pypdf beautifulsoup4 matplotlib
npx playwright install chromium                  # then set the executablePath in render.mjs to that Chromium
.venv/bin/python build.py                        # writes ScamShield_Project_Report.pdf here
```
