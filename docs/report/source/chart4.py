exec(open('charts.py').read().split('# 1 PR curves')[0])
st=['Scam call\nreceived','Told account\nwill be blocked','Enters payee\n& amount','Presses\nPay','Risk check\nresult','Decision','Afterwards']
wo=[2,1,2,2,2,2,1]; wi=[2,1,2,2,2.5,3.5,4]
fig,ax=plt.subplots(figsize=(6.6,3.0))
ax.plot(range(7),wo,color='#e34948',lw=2,marker='o',ms=6,label='Today (no pre-payment check)')
ax.plot(range(7),wi,color='#1baf7a',lw=2,marker='s',ms=6,label='With ScamShield')
notes={4:'MEDIUM → questions\n→ HIGH',5:'Pause; "Cancel\nand report"',6:'Money kept;\npayee blocked'}
for x,t in notes.items(): ax.annotate(t,(x,wi[x]),xytext=(0,10),textcoords='offset points',ha='center',fontsize=7.2,color=MUTED)
ax.annotate('Pays; second\n"deposit" asked',(5,2),xytext=(0,-26),textcoords='offset points',ha='center',fontsize=7.2,color=MUTED)
ax.set_xticks(range(7),st,fontsize=7.8); ax.set_yticks([1,2,3,4,5]); ax.set_ylim(0.3,5.6); ax.set_ylabel('Emotional state'); ax.legend(loc='upper left',fontsize=8); ax.grid(axis='x',visible=False)
save('journey')
