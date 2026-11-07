import json, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
E=json.load(open('/Users/vijender/scamshield/services/ml/models/gbm-20261014-074524/evaluation.json'))
C={'rules_only':'#2a78d6','ml_only':'#eb6834','hybrid':'#1baf7a'}
L={'rules_only':'Rules only','ml_only':'ML only','hybrid':'Hybrid (rules + ML)'}
INK='#0b0b0b'; MUTED='#52514e'; GRID='#e4e3df'
plt.rcParams.update({'font.family':'serif','font.serif':['Times New Roman','Times','DejaVu Serif'],'font.size':10,
 'axes.edgecolor':MUTED,'axes.labelcolor':INK,'xtick.color':MUTED,'ytick.color':MUTED,'axes.spines.top':False,'axes.spines.right':False,
 'axes.grid':True,'grid.color':GRID,'grid.linewidth':0.6,'legend.frameon':False,'savefig.dpi':200,'savefig.bbox':'tight'})
def save(n): plt.savefig(f'fig/{n}.png'); plt.close()
# 1 PR curves
fig,ax=plt.subplots(figsize=(6,3.8))
for k in C:
    pts=E['systems'][k]['pr_curve']; ax.plot([p['recall'] for p in pts],[p['precision'] for p in pts],color=C[k],lw=2,label=f"{L[k]} (PR-AUC {E['systems'][k]['pr_auc']:.3f})")
ax.set_xlabel('Recall (share of scams caught)'); ax.set_ylabel('Precision'); ax.set_xlim(0,1.01); ax.set_ylim(0,1.03); ax.legend(loc='lower left'); save('pr_curves')
# 2 sweep
sw=E['systems']['hybrid']['sweep']; th=[s['threshold'] for s in sw]
fig,ax=plt.subplots(figsize=(6,3.6))
ax.plot(th,[s['precision'] for s in sw],color='#2a78d6',lw=2,label='Precision')
ax.plot(th,[s['recall'] for s in sw],color='#eb6834',lw=2,ls='--',label='Recall')
ax.plot(th,[s['fpr'] for s in sw],color='#1baf7a',lw=2,ls=':',label='False-positive rate')
for t,n in [(35,'MEDIUM ≥ 35'),(70,'HIGH ≥ 70')]: ax.axvline(t,color=MUTED,lw=0.8,ls='-.'); ax.text(t+1,0.5,n,color=MUTED,fontsize=8,rotation=90)
ax.set_xlabel('Hybrid score threshold'); ax.set_ylabel('Rate'); ax.set_ylim(0,1.03); ax.legend(loc='center right'); save('sweep')
# 3 per scenario
import numpy as np
ps={r['scenario']:r for r in E['per_scenario']}
names={'impersonation':'Impersonation','mule':'Mule collection','velocity':'Velocity drain','takeover':'Account takeover'}
fig,ax=plt.subplots(figsize=(6.2,3.4)); x=np.arange(4); w=0.26
for i,k in enumerate(C):
    vals=[ps[s][k]*100 for s in names]; b=ax.bar(x+(i-1)*w,vals,w-0.03,color=C[k],label=L[k])
    for xi,v in zip(x+(i-1)*w,vals): ax.text(xi,v+1,f'{v:.0f}',ha='center',fontsize=7,color=MUTED)
ax.set_xticks(x,names.values()); ax.set_ylabel('Scams caught at score ≥ 35 (%)'); ax.set_ylim(0,110); ax.legend(loc='upper center',ncol=3,bbox_to_anchor=(0.5,1.15)); ax.grid(axis='x',visible=False); save('scenarios')
gn={'legit':'Everyday','legit_festival':'Festival','legit_new_payee':'New payee','legit_batch':'Batch','legit_new_contact':'New contact','legit_new_merchant':'New merchant'}
fig,ax=plt.subplots(figsize=(6.2,3.4)); x=np.arange(len(gn))
for i,k in enumerate(C):
    vals=[ps[s][k]*100 for s in gn]; ax.bar(x+(i-1)*w,vals,w-0.03,color=C[k],label=L[k])
ax.set_xticks(x,[f"{v}\n(n={ps[s]['count']:,})" for s,v in gn.items()],fontsize=8); ax.set_ylabel('Genuine payments flagged (%)'); ax.legend(loc='upper left'); ax.grid(axis='x',visible=False); save('false_alarms')
# 4 importance
fi=E['feature_importance'][:12][::-1]
fig,ax=plt.subplots(figsize=(6,3.8)); ax.barh([f['feature'] for f in fi],[f['importance'] for f in fi],color='#2a78d6',height=0.6)
ax.set_xlabel('Permutation importance (drop in PR-AUC)'); ax.grid(axis='y',visible=False); ax.tick_params(axis='y',labelsize=8); save('importance')
# 5 calibration
cp=E['calibration']['points']
fig,ax=plt.subplots(figsize=(4.6,4)); ax.plot([0,1],[0,1],color=MUTED,ls='--',lw=1,label='Perfect calibration')
ax.plot([p['predicted'] for p in cp],[p['observed'] for p in cp],color='#eb6834',lw=2,marker='o',ms=5,label='Calibrated GBM')
ax.set_xlabel('Predicted fraud probability'); ax.set_ylabel('Observed fraud rate'); ax.legend(loc='upper left'); save('calibration')
# 6 latency
fig,ax=plt.subplots(figsize=(5.5,2.8)); labs=['p50','p90','p97.5','p99','max']; v=[42,87,106,118,147]
ax.bar(labs,v,color='#2a78d6',width=0.55); ax.axhline(300,color='#e34948',lw=1,ls='--'); ax.text(4.3,290,'300 ms budget',ha='right',va='top',fontsize=8,color=MUTED)
for i,val in enumerate(v): ax.text(i,val+5,f'{val} ms',ha='center',fontsize=8,color=MUTED)
ax.set_ylabel('Latency (ms)'); ax.set_ylim(0,320); ax.grid(axis='x',visible=False); save('latency')
# 7 gantt
tasks=[('Problem study, literature & market research','W-2',0,2,'#2a78d6'),('Requirements, SRS & architecture','W-1',1,1.5,'#2a78d6'),
('P0 Scaffold, Docker, Prisma schema','W1',2.5,0.2,'#eb6834'),('P1 Data generator, training, evaluation','W1',2.7,0.4,'#eb6834'),
('P2+P3 API core & risk pipeline','W1',3.1,0.4,'#eb6834'),('P4+P5 Web app, analyst & admin consoles','W1',3.5,0.6,'#eb6834'),('P6 Hardening, tests, docs','W1',4.1,0.4,'#eb6834'),
('Load testing, leak fixes, demo rehearsal','W2',4.5,1.5,'#1baf7a'),('Viva demonstration','W3',6,0.5,'#1baf7a'),('Report & product documentation','W3–W5',6.5,2.5,'#1baf7a')]
fig,ax=plt.subplots(figsize=(6.6,3.6))
for i,(n,_,s,d,c) in enumerate(tasks): ax.barh(i,d,left=s,color=c,height=0.55)
ax.set_yticks(range(len(tasks)),[t[0] for t in tasks],fontsize=8); ax.invert_yaxis()
ax.set_xticks(range(0,10),['W-2','W-1','W0','Build','W2','W3','W4','W5','W6','W7'][:10],fontsize=8)
ax.set_xticks([0,1,2,2.5,4.5,6,7,8,9]); ax.set_xticklabels(['Wk −2','Wk −1','','Build wk\n(14 Oct)','Wk 2','Wk 3','Wk 4','Wk 5','7 Nov'],fontsize=7)
ax.grid(axis='y',visible=False); save('gantt')
