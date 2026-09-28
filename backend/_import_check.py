import traceback
try:
    import api.main as m
    print("IMPORT_OK", m.app.title, m.app.version)
except Exception:
    traceback.print_exc()
