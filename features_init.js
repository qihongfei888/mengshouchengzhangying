// features_init.js - photo fix, fireworks, routing, daily star
(function(){

window.getBeastPhoto=function(id,stage){if(!id)return '';return 'photos/'+id+'/stage'+Math.max(1,Math.min(5,stage||1))+'.jpg';};

function patchAppPhoto(){if(window.app&&!window.app._photoPatch){window.app.getBeastPhoto=window.getBeastPhoto;window.app._photoPatch=true;}}

window.fixPetPhotos=function(){
  document.querySelectorAll('.pet-img-stage,.student-card-v2-pet img,.student-pet-preview img').forEach(function(img){
    var src=img.getAttribute('src')||'';
    var m=src.match(/photos\/([^\/]+)\/(mature|growing|egg|baby)\//);
    if(m&&!img._pf){img._pf=1;var n=src.indexOf('stage3')>=0?5:src.indexOf('stage2')>=0?3:1;img.src='photos/'+m[1]+'/stage'+n+'.jpg';}
    img.classList.add('beast-rotating');
    if(img.parentElement&&img.parentElement.style)img.parentElement.style.perspective='1200px';
  });
  if(!window.app||!window.app.students)return;
  document.querySelectorAll('.student-card-v2').forEach(function(card){
    var sid=card.dataset.studentId||card.dataset.id;if(!sid)return;
    var s=window.app.students.find(function(x){return String(x.id)===String(sid);});if(!s||!s.pet||!s.pet.typeId)return;
    var pa=card.querySelector('.student-card-v2-pet');if(!pa)return;
    var ei=pa.querySelector('img');
    var stage=Math.max(1,Math.min(5,s.pet.stage||1));
    var correct='photos/'+s.pet.typeId+'/stage'+stage+'.jpg';
    if(ei){if((ei.getAttribute('src')||'').indexOf('photos/'+s.pet.typeId+'/stage')<0){ei.src=correct;ei._pf=1;}ei.classList.add('beast-rotating');}
    else if(!card._pi){card._pi=1;var i=document.createElement('img');i.src=correct;i.style.cssText='width:80px;height:80px;border-radius:50%;object-fit:cover;display:block;margin:0 auto;';i.className='pet-img-stage beast-rotating';i.onerror=function(){this.style.display='none';};pa.insertBefore(i,pa.firstChild);}
    pa.style.perspective='1200px';
  });
};

function fw(){var c=['#FF6B35','#FFD23F','#06D6A0','#1B98F5','#9B59F7','#EF476F','#fff'];var st=document.createElement('style');st.textContent='@keyframes fwp{0%{transform:translate(var(--tx),var(--ty)) scale(0);opacity:1}100%{transform:translate(var(--tx),var(--ty)) scale(1.5);opacity:0}}';document.head.appendChild(st);for(var i=0;i<60;i++)(function(i){setTimeout(function(){var p=document.createElement('div');var x=(Math.random()*160-80)+'vw',y=(Math.random()*160-80)+'vh';var d=(0.5+Math.random()*0.8).toFixed(2)+'s',dl=(Math.random()*1.5).toFixed(2)+'s';p.style.cssText='position:fixed;top:50%;left:50%;width:10px;height:10px;border-radius:50%;pointer-events:none;z-index:9999;background:'+c[i%c.length]+';--tx:'+x+';--ty:'+y+';animation:fwp '+d+' ease-out '+dl+' forwards;';document.body.appendChild(p);setTimeout(function(){p.remove();},(+d.replace('s','')+2)*1000);},i*40);})(i);}
window.launchFireworks=fw;

function patchApp(){
  patchAppPhoto();
  if(!window.app||!window.app.showPage||window.app.showPage._pk)return;
  var orig=window.app.showPage.bind(window.app);
  window.app.showPage=function(pid){orig(pid);if(pid==='monopoly'&&window.Monopoly)setTimeout(function(){window.Monopoly.render();},50);setTimeout(function(){window.fixPetPhotos();window.applyStageStyles&&window.applyStageStyles();},100);};
  window.app.showPage._pk=true;
}

function patchHonorTab(){
  document.querySelectorAll('.honor-period-tab').forEach(function(tab){
    tab.addEventListener('click',function(){
      var dsa=document.getElementById('dailyStarActions');
      if(dsa)dsa.style.display=tab.dataset.period==='day'?'flex':'none';
      if(tab.dataset.period==='day')buildDailyStar();
    });
  });
}

function buildDailyStar(){
  var sel=document.getElementById('dailyStarStudent');if(!sel||!window.app)return;
  var today=new Date().toDateString(),sc={};
  try{var d=getUserData(),cl=d.classes&&window.app.currentClassId?d.classes.find(function(c){return c.id===window.app.currentClassId;}):null;
    ((cl&&cl.scoreHistory)||[]).forEach(function(h){if(new Date(h.time||h.date).toDateString()===today&&h.points>0)sc[h.studentId]=(sc[h.studentId]||0)+h.points;});}catch(e){}
  var arr=(window.app.students||[]).slice().sort(function(a,b){return(sc[b.id]||0)-(sc[a.id]||0);});
  sel.innerHTML=arr.map(function(s){var p=sc[s.id]||0;return '<option value="'+s.id+'">'+s.name+(p?' (+'+p+'分今日)':'')+'</option>';}).join('');
}
window.buildDailyStarCandidates=buildDailyStar;

function injectIntros(){
  var grid=document.getElementById('studentList');if(!grid)return;
  function run(){
    grid.querySelectorAll('.student-card-v2').forEach(function(card){
      if(card.querySelector('.beast-intro'))return;
      var sid=card.dataset.studentId||card.dataset.id;if(!sid)return;
      var s=window.app&&window.app.students&&window.app.students.find(function(x){return String(x.id)===String(sid);});if(!s||!s.pet)return;
      var bid=s.pet.typeId||s.pet.beastId;
      var t=window.PET_TYPES&&window.PET_TYPES.find(function(x){return x.id===bid;});
      var desc=(t&&t.desc)||(window.BEAST_DESC&&window.BEAST_DESC[bid])||'';if(!desc)return;
      var d=document.createElement('div');d.className='beast-intro';d.textContent=desc;card.appendChild(d);
    });
    window.fixPetPhotos();window.applyStageStyles&&window.applyStageStyles();
  }
  run();
}

function patchRender(){
  if(!window.app||!window.app.renderStudents||window.app.renderStudents._p)return;
  var orig=window.app.renderStudents.bind(window.app);
  window.app.renderStudents=function(){orig();setTimeout(function(){window.fixPetPhotos();window.applyStageStyles&&window.applyStageStyles();injectIntros();},80);};
  window.app.renderStudents._p=true;
}

function init(){patchApp();patchHonorTab();injectIntros();patchRender();window.fixPetPhotos();window.applyStageStyles&&window.applyStageStyles();}

if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}else{init();}
setTimeout(function(){patchApp();patchRender();window.fixPetPhotos();window.applyStageStyles&&window.applyStageStyles();},1500);

})();
