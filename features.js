/* features.js - 萌兽成长营扩展功能 */
'use strict';

window.BEAST_DESC = {
  qinglong:'青龙，东方之神，掌管风雨，翠鳞闪耀，守护四方安宁。',
  baihu:'白虎，西方之神，威猛无双，百兽之王，镇守一方。',
  zhuque:'朱雀，南方之神，浴火重生，羽翼燃烧，吉祥如意。',
  xuanwu:'玄武，北方之神，龟蛇合体，寿与天齐，稳如磐石。',
  fenghuang:'凤凰，百鸟之王，飞翔于天际，象征美好与重生。',
  qinlin:'麒麟，仁兽也，脚踏祥云，出现则天下太平。',
  pixiu:'貔貅，上古神兽，能吞万物而不泄，招财辟邪。',
  yinglong:'应龙，有翼之龙，助黄帝战蚩尤，威震八方。',
  zhulong:'烛龙，人面龙身，口衔烛火，照耀幽冥之地。',
  taotie:'饕餮，贪食之兽，青铜器上的守护神纹，凶猛异常。',
  hundun:'混沌，天地未开之神，七窍未凿，蕴含无尽能量。',
  jiuweihu:'九尾狐，千年修炼，九尾齐现，智慧与美丽并存。',
  jingwei:'精卫，炎帝之女溺海化鸟，以石填海，永不言弃。',
  jinwu:'金乌，三足神鸟，栖于太阳之中，掌管光明与温暖。',
  yutu:'玉兔，月宫神兽，手持玉杵捣药，善良温柔。',
  xiezhi:'獬豸，独角神兽，能辨善恶是非，是公正的象征。',
  baize:'白泽，圣兽也，能言语，知天下鬼神之事，黄帝得之。',
  tiangou:'天狗，流星化身，速如闪电，护主忠诚不二。',
};

function _addKF(name,frames){if(document.getElementById('kf-'+name))return;const s=document.createElement('style');s.id='kf-'+name;s.textContent='@keyframes '+name+'{'+frames+'}';document.head.appendChild(s);}
function _esc(str){return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function _speak(t){if(!window.speechSynthesis)return;const u=new SpeechSynthesisUtterance(t);u.lang='zh-CN';u.rate=1;u.pitch=1.2;window.speechSynthesis.speak(u);}
// ── 每日之星 ──────────────────────────
window.openDailyStarAward = function() {
  var modal=document.getElementById('dailyStarModal'); if(!modal)return;
  var sel=document.getElementById('dailyStarStudent');
  if(sel) sel.innerHTML=(window.app.students||[]).map(function(s){return '<option value="'+s.id+'">'+_esc(s.name)+'</option>';}).join('');
  modal.classList.add('show');
};
window.awardDailyStar = function() {
  var id=document.getElementById('dailyStarStudent').value;
  var reason=document.getElementById('dailyStarReason').value||'每日之星';
  var pts=parseInt(document.getElementById('dailyStarPoints').value)||5;
  var s=(window.app.students||[]).find(function(x){return x.id===id;});
  if(!s)return;
  if(typeof window.app.addScoreToStudent==='function'){window.app.addScoreToStudent(id,pts,'⭐'+reason);}
  else{s.points=(s.points||0)+pts;if(!s.scoreHistory)s.scoreHistory=[];s.scoreHistory.unshift({time:Date.now(),delta:pts,reason:'⭐'+reason});window.app.saveStudents();}
  if(!s.dailyStars)s.dailyStars=[];s.dailyStars.unshift({date:new Date().toLocaleDateString('zh-CN'),reason:reason,pts:pts});
  window.app.saveStudents();
  _speak('恭喜'+s.name+'荣获今日每日之星！');
  _addKF('dsPop','0%{opacity:0;transform:translate(-50%,-50%) scale(0.2)}30%{opacity:1;transform:translate(-50%,-50%) scale(1.2)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-80%) scale(0.8)}');
  var el=document.createElement('div');
  el.style.cssText='position:fixed;top:45%;left:50%;z-index:10002;pointer-events:none;text-align:center;animation:dsPop 2.5s ease-out forwards;';
  el.innerHTML='<div style="font-size:4rem">⭐</div><div style="font-size:1.8rem;font-weight:bold;color:#FFD23F;text-shadow:0 0 20px #FFD23F">'+_esc(s.name)+'<br>每日之星！</div>';
  document.body.appendChild(el);
  setTimeout(function(){el.remove();},2600);
  document.getElementById('dailyStarModal').classList.remove('show');
  if(typeof window.app.renderHonor==='function')window.app.renderHonor();
};

// ── 幸运大抽奖 ──────────────────────────
window.LuckyDraw = {
  prizes: [
    {name:'小红花',emoji:'🌸',color:'#EF476F',pts:0},
    {name:'积分+3',emoji:'⭐',color:'#FFD23F',pts:3},
    {name:'免作业券',emoji:'📜',color:'#06D6A0',pts:0},
    {name:'积分+5',emoji:'🌟',color:'#FF9F1C',pts:5},
    {name:'神兽食粮x2',emoji:'🍖',color:'#9B59F7',pts:0},
    {name:'加油继续',emoji:'💪',color:'#1B98F5',pts:0},
    {name:'积分+10',emoji:'🎯',color:'#FF6B35',pts:10},
    {name:'神秘奖励',emoji:'🎁',color:'#06D6A0',pts:0},
  ],
  drawCount: 1,
  spinning: false,
  selectedStudentId: '',
  open: function() {
    if(!document.getElementById('luckyDrawModal')) this._buildModal();
    this._refreshPrizes();
    this._refreshStudents();
    document.getElementById('luckyDrawModal').classList.add('show');
  },
  close: function() { var m=document.getElementById('luckyDrawModal'); if(m)m.classList.remove('show'); },
  _buildModal: function() {
    var m=document.createElement('div'); m.id='luckyDrawModal'; m.className='modal';
    m.innerHTML='<div class="modal-content lucky-modal lucky-blackgold"><button class="modal-close" onclick="LuckyDraw.close()">✕</button>'+
      '<h3 class="lucky-title">🎰 幸运大抽奖</h3>'+
      '<div class="lucky-rays" aria-hidden="true"></div>'+
      '<div class="lucky-layout">'+
      '<div class="lucky-left">'+
      '<div class="lucky-row"><label>抽奖学生：</label><select id="luckyStudentSelect" class="login-input" onchange="LuckyDraw.onStudentChange(this.value)"></select></div>'+
      '<div id="luckyStudentInfo" class="lucky-student-info">请先选择学生</div>'+
      '<div class="lucky-row"><label>抽奖次数：</label>'+
      '<button class="btn btn-small btn-outline" onclick="LuckyDraw.setCount(1)">单抽</button> '+
      '<button class="btn btn-small btn-outline" onclick="LuckyDraw.setCount(3)">三连</button> '+
      '<button class="btn btn-small btn-outline" onclick="LuckyDraw.setCount(5)">五连</button> '+
      '<button class="btn btn-small btn-primary" onclick="LuckyDraw.setCount(10)">十连抽</button></div>'+
      '<canvas id="luckyWheel" width="260" height="260"></canvas>'+
      '<div class="lucky-action"><button class="btn btn-primary" onclick="LuckyDraw.spin()">🎰 开始抽奖</button></div>'+
      '<div id="luckyResult" class="lucky-result-grid"></div>'+
      '</div>'+
      '<div class="lucky-right"><h4>奖品设置（老师可编辑）</h4><div id="luckyPrizeEdit"></div>'+
      '<button class="btn btn-small btn-primary" onclick="LuckyDraw.addPrize()" style="margin-top:8px">➕ 添加奖品</button></div>'+
      '</div></div>';
    document.body.appendChild(m);
    this._refreshPrizes();
    this._drawWheel();
  },
  _refreshStudents: function() {
    var sel=document.getElementById('luckyStudentSelect');
    if(!sel)return;
    var list=(window.app&&window.app.students)||[];
    sel.innerHTML='<option value="">请选择学生</option>'+list.map(function(s){return '<option value="'+s.id+'">'+_esc(s.name)+'</option>';}).join('');
    if(this.selectedStudentId) sel.value=this.selectedStudentId;
    this.onStudentChange(sel.value || '');
  },
  onStudentChange: function(studentId) {
    this.selectedStudentId = studentId || '';
    var info=document.getElementById('luckyStudentInfo');
    if(!info)return;
    var s=((window.app&&window.app.students)||[]).find(function(x){return x.id===studentId;});
    info.textContent = s ? ('当前学生：'+s.name+' ｜ 积分：'+(s.points||0)) : '请先选择学生';
  },
  setCount: function(n) { this.drawCount=n; },
  _refreshPrizes: function() {
    var el=document.getElementById('luckyPrizeEdit'); if(!el)return;
    el.innerHTML=this.prizes.map(function(p,i){
      return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">'+
        '<span style="font-size:1.4rem">'+p.emoji+'</span>'+
        '<input value="'+_esc(p.name)+'" style="flex:1;padding:4px 8px;border:1px solid #ddd;border-radius:6px" onchange="LuckyDraw.prizes['+i+'].name=this.value;LuckyDraw._drawWheel()">'+
        '<button class="btn btn-small btn-danger" onclick="LuckyDraw.prizes.splice('+i+',1);LuckyDraw._refreshPrizes();LuckyDraw._drawWheel()">✕</button>'+
        '</div>';
    }).join('');
    this._drawWheel();
  },
  addPrize: function() {
    this.prizes.push({name:'新奖品',emoji:'🎁',color:'#'+Math.floor(Math.random()*0xFFFFFF).toString(16).padStart(6,'0'),pts:0});
    this._refreshPrizes();
  },
  _drawWheel: function() {
    var c=document.getElementById('luckyWheel'); if(!c)return;
    var ctx=c.getContext('2d'),n=this.prizes.length,r=120,cx=130,cy=130,arc=2*Math.PI/n;
    ctx.clearRect(0,0,260,260);
    var colors=['#FF6B35','#FFD23F','#06D6A0','#1B98F5','#9B59F7','#EF476F','#FF9F1C','#2ECC71'];
    for(var i=0;i<n;i++){
      ctx.beginPath();ctx.moveTo(cx,cy);
      ctx.arc(cx,cy,r,arc*i-Math.PI/2,arc*(i+1)-Math.PI/2);
      ctx.fillStyle=colors[i%colors.length];ctx.fill();
      ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();
      ctx.save();ctx.translate(cx,cy);
      ctx.rotate(arc*i+arc/2-Math.PI/2);
      ctx.textAlign='right';ctx.fillStyle='#fff';ctx.font='bold 13px sans-serif';
      ctx.fillText(this.prizes[i].emoji+' '+this.prizes[i].name,r-8,4);
      ctx.restore();
    }
    // 指针
    ctx.beginPath();ctx.moveTo(cx,cy-r-10);ctx.lineTo(cx-10,cy-r+14);ctx.lineTo(cx+10,cy-r+14);
    ctx.fillStyle='#E8521A';ctx.fill();
  },
  spin: function() {
    if(this.spinning)return;
    if(!this.selectedStudentId){ alert('请先选择学生再抽奖'); return; }
    var self=this,results=[];
    var doSpin=function(remaining,cb){
      if(remaining<=0){cb(results);return;}
      self.spinning=true;
      var c=document.getElementById('luckyWheel');if(!c)return;
      var n=self.prizes.length,arc=360/n,spins=5+Math.floor(Math.random()*5);
      var idx=Math.floor(Math.random()*n),deg=spins*360+arc*idx+arc/2;
      var start=null,duration=3000,fromDeg=self._currentDeg||0;
      function animate(ts){
        if(!start)start=ts;
        var t=Math.min((ts-start)/duration,1),ease=1-Math.pow(1-t,4);
        var cur=fromDeg+deg*ease;
        var canvas=document.getElementById('luckyWheel');if(!canvas)return;
        var ctx=canvas.getContext('2d');
        ctx.save();ctx.translate(130,130);ctx.rotate(cur*Math.PI/180);ctx.translate(-130,-130);
        self._drawWheel();ctx.restore();
        if(t<1){requestAnimationFrame(animate);}
        else{
          self._currentDeg=(fromDeg+deg)%360;self.spinning=false;
          results.push(self.prizes[idx]);doSpin(remaining-1,cb);
        }
      }
      requestAnimationFrame(animate);
    };
    doSpin(self.drawCount,function(res){
      self._showResults(res);
    });
  },
  _showResults: function(results) {
    var el=document.getElementById('luckyResult');if(!el)return;
    var student=((window.app&&window.app.students)||[]).find(function(x){return x.id===window.LuckyDraw.selectedStudentId;});
    el.innerHTML=results.map(function(p,i){
      return '<div class="lucky-result-card" style="--d:'+(i*120)+'ms;border-color:'+p.color+'">'+
        '<span class="lucky-result-emoji">'+p.emoji+'</span><span class="lucky-result-name">'+_esc(p.name)+'</span></div>';
    }).join('');
    // 卡片弹出光环特效
    results.forEach(function(p,i){
      setTimeout(function(){ window.LuckyDraw._prizeCard(p); },i*600);
    });
    if(student){
      var gain=results.reduce(function(sum,p){ return sum + (parseInt(p.pts,10)||0); },0);
      if(gain>0 && window.app){
        student.points=(student.points||0)+gain;
        if(!student.scoreHistory) student.scoreHistory=[];
        student.scoreHistory.unshift({time:Date.now(),delta:gain,reason:'幸运大抽奖奖励'});
        if(typeof window.app.saveStudents==='function') window.app.saveStudents();
      }
    }
    _speak('恭喜' + (student?student.name:'同学') + '获得' + results.map(function(p){return p.name;}).join('，') + '！');
  },
  _prizeCard: function(p) {
    _addKF('prizeIn','0%{opacity:0;transform:translate(-50%,-50%) scale(0.2) rotate(-15deg)}40%{opacity:1;transform:translate(-50%,-50%) scale(1.15) rotate(3deg)}60%{transform:translate(-50%,-50%) scale(0.95)}80%{opacity:1;transform:translate(-50%,-50%) scale(1.05)}100%{opacity:0;transform:translate(-50%,-80%) scale(0.8)}');
    _addKF('haloSpin','0%{transform:translate(-50%,-50%) rotate(0deg) scale(1)}100%{transform:translate(-50%,-50%) rotate(360deg) scale(1.1)}');
    var wrap=document.createElement('div');
    wrap.style.cssText='position:fixed;top:50%;left:50%;z-index:10003;pointer-events:none;';
    var halo=document.createElement('div');
    halo.style.cssText='position:absolute;top:50%;left:50%;width:420px;height:420px;border-radius:50%;background:repeating-conic-gradient(from 0deg,rgba(255,215,64,.45) 0 12deg,rgba(255,166,0,.08) 12deg 24deg);filter:blur(1px);animation:haloSpin 2.2s linear infinite;opacity:0.8;transform:translate(-50%,-50%);';
    var card=document.createElement('div');
    card.style.cssText='position:absolute;top:50%;left:50%;width:220px;background:linear-gradient(180deg,#fff 0%,#fff9e8 100%);border:4px solid #ffe08a;border-radius:24px;padding:18px 16px;text-align:center;animation:prizeIn 2.5s ease-out forwards;box-shadow:0 0 60px rgba(255,211,79,.85),0 12px 24px rgba(0,0,0,.25);';
    card.innerHTML='<div style="position:absolute;left:10px;top:10px;background:#6fa8ff;color:#fff;border-radius:12px;padding:2px 8px;font-weight:700;font-size:.95rem">'+(parseInt(p.pts,10)||0)+'</div><div style="font-size:3.7rem;margin-top:6px">'+p.emoji+'</div><div style="font-size:1.25rem;font-weight:800;margin-top:8px;color:#8a5a00">'+_esc(p.name)+'</div><div style="font-size:1rem;color:#5a4500;margin-top:6px">获得奖励卡！</div>';
    wrap.appendChild(halo);wrap.appendChild(card);document.body.appendChild(wrap);
    setTimeout(function(){wrap.remove();},2600);
  }
};