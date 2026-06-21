# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for Local Lead Studio backend (onedir).
# Build:  python -m PyInstaller --noconfirm --clean lls-backend.spec
from PyInstaller.utils.hooks import collect_all, collect_submodules

datas = [
    ("../config.json", "."),
    ("lead_studio_data/cities.json", "."),
    ("lead_studio_data/categories.json", "."),
    ("../frontend/dist", "frontend_dist"),
]
binaries = []
hiddenimports = []

# uvicorn/anyio import their loop/protocol/backend submodules dynamically.
for pkg in ("uvicorn", "anyio"):
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h

# Local namespace package (no __init__.py) — pull every submodule explicitly.
hiddenimports += collect_submodules("lead_studio")

a = Analysis(
    ["yamap_landing_web.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["playwright"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="lls-backend",
    console=True,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="lls-backend",
)
