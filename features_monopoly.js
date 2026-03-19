/* features_monopoly.js - 神兽大富翁PK游戏 */
(function(){
'use strict';
function _esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function _speak(t){if(!window.speechSynthesis)return;var u=new SpeechSynthesisUtterance(t);u.lang='zh-CN';u.rate=1;window.speechSynthesis.speak(u);}
var CE={START:'#06D6A0',FINISH:'#FFD23F',NORMAL:'#f0f8ff',MINE:'#EF476F',BONUS:'#06D6A0',PORTAL:'#9B59F7',SKIP:'#FF9F1C',DOUBLE:'#1B98F5',BACK:'#EF476F'};
var CI={START:'🏁',FINISH:'🏆',NORMAL:'⬜',MINE:'💣',BONUS:'🎁',PORTAL:'🌀',SKIP:'⏭',DOUBLE:'✖',BACK:'⬅'};
window.Monopoly={
  s:{n:32,mines:[{p:6,v:-2,l:'走神扣2分'},{p:13,v:-3,l:'未交作业扣3分'},{p:20,v:-2,l:'违纪扣2分'}],bonuses:[{p:4,v:3,l:'发言加3分'},{p:10,v:2,l:'作业优秀加2分'},{p:17,v:5,l:'满分加5分'}],portal:true,skip:true,dbl:true,back:true},
  groups:[],cells:[],turn:0,on:false,busy:false,
  build:function(){
    var s=this.s,n=s.n,self=this;this.cells=[];
    for(var i=0;i<n;i++)this.cells.push({t:'NORMAL',l:'',v:0});
    this.cells[0].t='START';this.cells[0].l='起点';
    this.cells[n-1].t='FINISH';this.cells[n-1].l='终点';
    s.mines.forEach(function(m){if(m.p>0&&m.p<n-1){self.cells[m.p].t='MINE';self.cells[m.p].l=m.l;self.cells[m.p].v=m.v;}});
    s.bonuses.forEach(function(b){if(b.p>0&&b.p<n-1){self.cells[b.p].t='BONUS';self.cells[b.p].l=b.l;self.cells[b.p].v=b.v;}});
    var av=[];for(var j=2;j<n-2;j++)if(this.cells[j].t==='NORMAL')av.push(j);
    av.sort(function(){return Math.random()-0.5;});var ai=0;
    [{t:'PORTAL',l:'传送门'},{t:'SKIP',l:'跳过回合'},{t:'DOUBLE',l:'积分翻倍'},{t:'BACK',l:'后退3格'}].forEach(function(x){
      if(ai<av.length){self.cells[av[ai]].t=x.t;self.cells[av[ai]].l=x.l;ai++;}
    });
  },
  loadG:function(){
    var raw=[];try{
      var d=typeof getUserData==='function'?getUserData():{};
      var cl=d.classes?d.classes.find(function(c){return c.id===window.app.currentClassId;}):null;
      raw=(cl&&cl.groups)?cl.groups:[];
    }catch(e){}
    var cols=['#FF6B35','#1B98F5','#06D6A0','#9B59F7','#FFD23F','#EF476F'];
    this.groups=raw.map(function(g,i){return{id:g.id,name:g.name||'小组',beastId:g.beastId||(window.BEASTS&&window.BEASTS[0]?window.BEASTS[0].id:'qinglong'),icon:g.icon||'🐉',pos:0,score:g.points||0,skip:false,color:g.color||cols[i%6]};});
    if(!this.groups.length)this.groups=[{id:'g1',name:'龙组',beastId:'qinglong',icon:'🐉',pos:0,score:0,skip:false,color:'#FF6B35'},{id:'g2',name:'凤组',beastId:'fenghuang',icon:'🦚',pos:0,score:0,skip:false,color:'#1B98F5'}];
  },
  render:function(){
    if(!this.on)this.loadG();
    if(!this.cells.length)this.build();
    var board=document.getElementById('monopolyBoard');if(!board)return;
    var self=this,n=this.cells.length;
    board.style.gridTemplateColumns='repeat(8,1fr)';board.innerHTML='';
    for(var i=0;i<n;i++){
      var cell=this.cells[i],col=CE[cell.t]||'#f0f8ff';
      var div=document.createElement('div');div.className='monopoly-cell';
      div.style.background=col+'22';div.style.borderColor=col;
      var here=this.groups.filter(function(g){return g.pos===i;});
      var pw=here.map(function(g){
        var img=window.app&&window.app.getBeastPhoto?window.app.getBeastPhoto(g.beastId,5):'';
        return '<div class="mp-pawn" style="border-color:'+g.color+'"><img src="'+img+'" style="width:26px;height:26px;border-radius:50%;object-fit:cover" onerror="this.style.display=\'none\'"></div>';
      }).join('');
      div.innerHTML='<span class="mp-num">'+i+'</span><span class="mp-ico">'+(CI[cell.t]||'⬜')+'</span><span class="mp-lbl">'+cell.l+'</span><div class="mp-pawns">'+pw+'</div>';
      if(here.length)div.style.boxShadow='0 0 10px '+here[0].color;
      board.appendChild(div);
    }
    this.renderSide();
  },
  renderSide:function(){
    var el=document.getElementById('monopolyGroupsList');if(!el)return;
    var self=this,ai=this.turn%Math.max(this.groups.length,1);
    el.innerHTML=this.groups.map(function(g,i){
      var img=window.app&&window.app.getBeastPhoto?window.app.getBeastPhoto(g.beastId,5):'';
      var bdr=(self.on&&i===ai)?'border:3px solid '+g.color:'border:2px solid #eee';
      return '<div class="mp-group-card" style="'+bdr+'"><img src="'+img+'" style="width:40px;height:40px;border-radius:50%;object-fit:cover" onerror="this.style.display=\'none\'"><div><strong>'+_esc(g.name)+'</strong><br><span style="color:'+g.color+'">⭐'+g.score+'分 📍第'+g.pos+'格</span>'+(g.skip?'<span style="color:#EF476F"> ⏭跳过</span>':'')+'</div></div>';
    }).join('');
    if(!this.on){this.groups.forEach(function(g,i){var opts=(window.BEASTS||[]).map(function(b){return '<option value="'+b.id+'"'+(b.id===g.beastId?' selected':'')+'>'+b.icon+' '+b.name+'</option>';}).join('');el.innerHTML+='<div style="margin-top:6px"><label>'+_esc(g.name)+'：</label><select onchange="Monopoly.groups['+i+'].beastId=this.value"><option>选神兽</option>'+opts+'</select></div>';});}
    var info=document.getElementById('monopolyTurnInfo'),rb=document.getElementById('monopolyRollBtn');
    if(info&&this.on){var g=this.groups[ai];if(g)info.innerHTML='<strong style="color:'+g.color+'">'+_esc(g.name)+'</strong> 的回合！'+(g.skip?'<br><span style="color:#EF476F">本回合跳过</span>':'');}
    else if(info)info.innerHTML='<p style="color:#888">点击「开始游戏」</p>';
    if(rb)rb.disabled=!this.on;
  },
  startGame:function(){this.loadG();this.build();this.groups.forEach(function(g){g.pos=0;g.skip=false;});this.turn=0;this.on=true;this.render();this.log('🎮 游戏开始！','#FF6B35');_speak('神兽大PK游戏开始！');},
  resetGame:function(){this.on=false;this.turn=0;this.cells=[];this.groups.forEach(function(g){g.pos=0;g.score=0;g.skip=false;});this.render();this.log('🔄 重置','#888');},
  rollDice:function(){
    if(!this.on||this.busy)return;
    var ai=this.turn%this.groups.length,g=this.groups[ai],self=this;
    if(!g)return;
    if(g.skip){g.skip=false;this.log(g.name+' 跳过回合',g.color);this.next();return;}
    this.busy=true;var t=0,roll=Math.floor(Math.random()*6)+1;
    var de=document.getElementById('monopolyDice');
    var iv=setInterval(function(){if(de)de.textContent=Math.floor(Math.random()*6)+1;if(++t>18){clearInterval(iv);if(de)de.textContent=roll;self.move(ai,roll);self.busy=false;}},80);
  },
  move:function(idx,steps){var g=this.groups[idx],n=this.cells.length,self=this;var np=Math.min(g.pos+steps,n-1);this.log(g.name+' 掷出'+steps+'，到第'+np+'格',g.color);_speak(g.name+'掷出'+steps+'点');var cur=g.pos;function step(){cur=Math.min(cur+1,np);g.pos=cur;self.render();if(cur<np)setTimeout(step,200);else self.applyCell(idx);}setTimeout(step,200);},
  applyCell:function(idx){
    var g=this.groups[idx],cell=this.cells[g.pos],self=this;
    if(cell.t==='FINISH'){this.log(g.name+' 到达终点！','#FFD23F');_speak(g.name+'到达终点，获得胜利！');this.showWin(g);return;}
    if(cell.t==='MINE'){g.score+=cell.v;this.log(g.name+' 踩雷！'+cell.l,'#EF476F');_speak(g.name+'踩到地雷');}
    else if(cell.t==='BONUS'){g.score+=cell.v;this.log(g.name+' 获奖！'+cell.l,'#06D6A0');_speak(g.name+'获得奖励');}
    else if(cell.t==='PORTAL'){var d=Math.floor(Math.random()*this.cells.length);g.pos=d;this.log(g.name+' 传送到第'+d+'格','#9B59F7');_speak(g.name+'触发传送门');this.render();}
    else if(cell.t==='SKIP'){g.skip=true;this.log(g.name+' 下回合跳过','#FF9F1C');_speak(g.name+'下回合跳过');}
    else if(cell.t==='DOUBLE'){g.score*=2;this.log(g.name+' 积分翻倍！当前'+g.score+'分','#1B98F5');_speak(g.name+'积分翻倍');}
    else if(cell.t==='BACK'){g.pos=Math.max(0,g.pos-3);this.log(g.name+' 后退3格','#EF476F');_speak(g.name+'后退三格');this.render();}
    setTimeout(function(){self.next();},700);
  },
  next:function(){this.turn++;this.renderSide();var ai=this.turn%this.groups.length,g=this.groups[ai];if(g)_speak('轮到'+g.name+'掷骰子了！');},
  log:function(msg,color){var el=document.getElementById('monopolyLog');if(!el)return;var d=document.createElement('div');d.style.cssText='padding:4px 8px;border-radius:6px;margin-bottom:4px;font-size:0.85rem;border-left:3px solid '+(color||'#FF6B35');d.textContent=new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})+' '+msg;el.insertBefore(d,el.firstChild);if(el.children.length>30)el.lastChild.remove();},
  showWin:function(g){
    var el=document.createElement('div');
    el.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10003;pointer-events:none;text-align:center;width:260px;background:#fff;border:4px solid '+g.color+';border-radius:24px;padding:30px 20px;box-shadow:0 0 60px '+g.color+'88;';
    el.innerHTML='<div style="font-size:3rem">🏆</div><div style="font-size:1.5rem;font-weight:bold;color:'+g.color+'">'+_esc(g.name)+'</div><div style="color:#888;margin-top:8px">到达终点，获得胜利！</div>';
    document.body.appendChild(el);
    setTimeout(function(){el.remove();},3200);
    if(window.launchFireworks)window.launchFireworks();
    _speak('恭喜'+g.name+'获得神兽大PK冠军！');
  }
};
})();
