import pikepdf, sys
src, dst = sys.argv[1], sys.argv[2]
reps = [tuple(a.split('=>')) for a in sys.argv[3:]]
pdf = pikepdf.open(src)
for page in pdf.pages:
    for c in (page.obj.Contents if isinstance(page.obj.Contents, pikepdf.Array) else [page.obj.Contents]):
        data = c.read_bytes()
        for a, b in reps:
            data = data.replace(a.encode('latin-1'), b.encode('latin-1'))
        c.write(data)
pdf.save(dst)
