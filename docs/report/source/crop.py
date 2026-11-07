from PIL import Image
src='/Users/vijender/scamshield/docs/screenshots/'
out='fig/'
crops={'model-evaluation':[(0,1200,'model-top'),(1258,2252,'model-charts')],'simulator':[(0,1100,'simulator-top')],'rules':[(0,1300,'rules-top')],'health':[(0,1150,'health-top')]}
for name,cs in crops.items():
    im=Image.open(src+name+'.png')
    for a,b,o in cs: im.crop((0,a,im.width,b)).save(out+o+'.png')
for n in ['landing','wallet','send-medium','send-high-risk','analyst','send-high-risk-mobile-dark']:
    Image.open(src+n+'.png').save(out+n+'.png')
