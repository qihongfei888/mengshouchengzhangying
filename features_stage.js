// features_stage.js - stage-based borders, glow, badges
(function(){

var CFG=[
  {b:'2px dashed #94a3b8',g:'rgba(148,163,184,0.35)',l:'封印之卵',bg:'#F1F5F9',c:'#475569'},
  {b:'2px solid #6EE7B7',g:'rgba(110,231,183,0.4)',l:'幼体初现',bg:'#ECFDF5',c:'#065F46'},
  {b:'2px solid #34D399',g:'rgba(52,211,153,0.45)',l:'灵气初聚',bg:'#D1FAE5',c:'#064E3B'},
  {b:'3px solid #059669',g:'rgba(5,150,105,0.5)',l:'神力觉醒',bg:'#A7F3D0',c:'#022C22'},
  {b:'3px solid #D4A017',g:'rgba(212,160,23,0.55)',l:'金阶显威',bg:'#FEF3C7',c:'#78350F'},
  {b:'3px solid #C0392B',g:'rgba(192,57,43,0.6)',l:'朱火成圣',bg:'#FEE2E2',c:'#7F1D1D'},
  {b:'3px solid #7C3AED',g:'rgba(124,58,237,0.6)',l:'玄紫升华',bg:'#EDE9FE',c:'#4C1D95'},
  {b:'4px solid #4338CA',g:'rgba(67,56,202,0.65)',l:'天罡之境',bg:'#E0E7FF',c:'#1E1B4B'},
  {b:'4px solid #1E40AF',g:'rgba(30,64,175,0.65)',l:'星辰之力',bg:'#DBEAFE',c:'#1E3A8A'},
  {b:'4px solid #6D28D9',g:'rgba(109,40,217,0.7)',l:'神界至尊',bg:'#F5F3FF',c:'#2E1065'},
  {b:'4px solid gold',g:'rgba(212,160,23,0.9)',l:'★ 传说满级 ★',bg:'#FFF7ED',c:'#92400E',rainbow:true}
];

// inject rainbow keyframe once
function ensureKF(){
  if(document.getElementById('kf-rbdr'))return;
  var s=document.createElement('style');s.id='kf-rbdr';
  s.textContent='@keyframes rbdr{0%{box-shadow:0 0 18px #FF6B35,0 4px 20px rgba(255,107,53,0.4)}25%{box-shadow:0 0 18px #FFD23F,0 4px 20px rgba(255,210,63,0.4)}50%{box-shadow:0 0 18px #06D6A0,0 4px 20px rgba(6,214,160,0.4)}75%{box-shadow:0 0 18px #1B98F5,0 4px 20px rgba(27,152,245,0.4)}100%{box-shadow:0 0 18px #FF6B35,0 4px 20px rgba(255,107,53,0.4)}}';
  document.head.appendChild(s);
}

window.applyStageStyles=function(){
  if(!window.app||!window.app.students)return;
  document.querySelectorAll('.student-card-v2').forEach(function(card){
    var sid=card.dataset.studentId||card.dataset.id;if(!sid)return;
    var s=window.app.students.find(function(x){return String(x.id)===String(sid);});if(!s||!s.pet)return;
    var stage=Math.min(s.pet.stage||0,CFG.length-1);
    var cfg=CFG[stage];
    card.style.border=cfg.b;
    if(cfg.rainbow){
      ensureKF();
      card.style.background='linear-gradient(160deg,#FFF9E6 0%,#FFFDF4 50%,#FFF9E6 100%)';
      card.style.animation='rbdr 2.5s ease-in-out infinite';
    } else {
      card.style.background='linear-gradient(160deg,'+cfg.bg+' 0%,#FFFDF4 50%,'+cfg.bg+' 100%)';
      card.style.boxShadow='0 4px 20px '+cfg.g+',inset 0 1px 0 rgba(255,255,255,0.8)';
      card.style.animation='';
    }
    // top color strip via ::before - update via CSS var
    card.style.setProperty('--stage-strip',cfg.b.split(' ').pop());
    // badge
    var badge=card.querySelector('.stage-badge');
    if(!badge){badge=document.createElement('div');badge.className='stage-badge';card.style.position='relative';card.appendChild(badge);}
    badge.textContent='Lv.'+stage+' '+cfg.l;
    badge.style.cssText='position:absolute;bottom:6px;right:6px;font-size:0.6rem;padding:2px 7px;border-radius:20px;background:'+cfg.g+';color:'+cfg.c+';font-weight:bold;letter-spacing:0.5px;z-index:4;backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,0.5);pointer-events:none;white-space:nowrap;';
  });
};

// add CSS for top strip
(function(){
  var s=document.createElement('style');
  s.textContent='.student-card-v2::before{background:var(--stage-strip,rgba(212,160,23,0.8)) !important;}';
  document.head.appendChild(s);
})();

// auto-apply on load
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',function(){setTimeout(window.applyStageStyles,500);});}
else{setTimeout(window.applyStageStyles,500);}

})();
