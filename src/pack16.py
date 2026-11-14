"""Pack the float32 terrain grids into 16-bit files for the web app (half the download).
height_m = offset + value * scale. Site grids: 0.1 m steps. Region grid: 0.25 m steps.
Run after export_options.py: python src/pack16.py"""
import json, glob, os
import numpy as np
T = 'web-data/terrain'
info = json.load(open(f'{T}/terrain.json'))
web = {'note': 'uint16 little-endian; height_m = offset + value * scale', 'region': None, 'sites': {}}
def pack(src, dst, scale):
    z = np.fromfile(src, '<f4'); off = float(np.floor(z.min()))
    q = np.round((z - off) / scale); assert q.max() <= 65535, src
    q.astype('<u2').tofile(dst); err = np.abs(off + q * scale - z).max()
    return {'file': os.path.basename(dst), 'offset': off, 'scale': scale, 'max_error_m': round(float(err), 4)}
web['region'] = pack(f'{T}/region_600m.bin', f'{T}/region_600m.u16', 0.25)
for f in sorted(glob.glob(f'{T}/*_10m.bin')):
    sid = os.path.basename(f)[:-8]; web['sites'][sid] = pack(f, f[:-4] + '.u16', 0.1)
info['web16'] = web
json.dump(info, open(f'{T}/terrain.json', 'w'), indent=1)
print(json.dumps(web['region']), len(web['sites']))
