exec(open('charts.py').read().split('# 1 PR curves')[0])
fig,ax=plt.subplots(figsize=(5.6,2.2))
labs=['SOM (5-yr obtainable)','SAM (UPI pre-txn scoring)','TAM (India FDP market)']; v=[4.8,483,8400]; cols=['#1baf7a','#eb6834','#2a78d6']
ax.barh(labs,v,color=cols,height=0.55); ax.set_xscale('log'); ax.set_xlim(1,30000)
for i,x in enumerate(v): ax.text(x*1.15,i,f'Rs {x:,.1f} cr' if x<10 else f'Rs {x:,.0f} cr',va='center',fontsize=8.5,color=MUTED)
ax.set_xlabel('Rs crore per year (log scale)'); ax.grid(axis='y',visible=False); save('tam')
