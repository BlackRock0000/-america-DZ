// ═══════════════════════════════════════════════════════════════════
// ADMIN SYNC & DELETED ACCOUNTS FIX
// إصلاح مشكلة ظهور الحسابات المحذوفة في الهواتف الأخرى
// وتوحيد لوحة التحكم لتكون مرآة حية للسيرفر
// ═══════════════════════════════════════════════════════════════════
(function(){
  'use strict';
  if(window.__ADM_SYNC_FIX_APPLIED__) return;
  window.__ADM_SYNC_FIX_APPLIED__ = true;

  // ── 1) متغيرات مرآة السيرفر ──
  if(typeof window._admServerUsers==='undefined') window._admServerUsers=null;

  function _isAdminOpen(){
    var ap=document.getElementById('adminPanel');
    return !!(ap && (ap.classList.contains('show') || ap.style.display==='flex' || ap.style.display==='block'));
  }
  function _isCurrentPhone(phone){
    try{return !!(typeof currentPhone!=='undefined' && currentPhone && normPhone(phone)===normPhone(currentPhone));}catch(e){return false;}
  }

  // ── 2) دفع حالة حذف المستخدم إلى السيرفر ──
  function _pushDeletedUserToServer(phone){
    phone=normPhone(phone);
    if(!window.SB || !SB.pushAppState) return Promise.resolve(false);
    return SB.select('app_state','key=eq.deleted_users').then(function(rows){
      var cur=(window.normalizeDeletedUsersValue?normalizeDeletedUsersValue(rows&&rows[0]&&rows[0].value):{phones:[],map:{}});
      var arr=cur.phones||[], map=cur.map||{};
      if(arr.map(normPhone).indexOf(phone)<0) arr.push(phone);
      map[phone]=Date.now();
      return SB.pushAppState('deleted_users',{phones:arr.map(normPhone),map:map,updated_at:Date.now()});
    }).catch(function(){
      return SB.pushAppState('deleted_users',{phones:[phone],map:{[phone]:Date.now()},updated_at:Date.now()});
    });
  }
  window._pushDeletedUserToServer=_pushDeletedUserToServer;

  // ── 3) تطهير الحسابات المحذوفة من هذا الجهاز ──
  function purgeDeletedUsers(){
    return (window.BRC_SYNC && BRC_SYNC.pullAppState?BRC_SYNC.pullAppState():Promise.resolve(false)).then(function(){
      var dm=(window.getDeletedUsersMap?getDeletedUsersMap():{});
      var phones=Object.keys(dm); if(!phones.length) return false;
      var users=window.getUsers?getUsers():{};
      var chats={};
      try{chats=JSON.parse(localStorage.getItem('blk_v15_fresh_chats')||'{}')||{};}catch(e){}
      var changed=false;
      phones.forEach(function(ph){
        ph=normPhone(ph);
        if(users[ph] && !_isCurrentPhone(ph)){delete users[ph]; changed=true;}
        if(chats[ph]){delete chats[ph]; changed=true;}
      });
      if(changed){
        window.saveUsers && saveUsers(users);
        localStorage.setItem('blk_v15_fresh_chats',JSON.stringify(chats));
      }
      return changed;
    });
  }
  window.purgeDeletedUsers=purgeDeletedUsers;

  function adminPurgeDeletedUsers(){
    if(typeof showConfirm!=='function') return;
    showConfirm('🧹','تطهير الحسابات المحذوفة','سيتم مسح كل الحسابات الموجودة في قائمة الحذف من ذاكرة هذا الجهاز. متابعة؟',function(){
      purgeDeletedUsers().then(function(changed){
        if(window.BRC_SYNC && BRC_SYNC.pullUsers) BRC_SYNC.pullUsers(true);
        toast && toast(changed?'✅ تم تطهير الحسابات المحذوفة':'✅ لا توجد حسابات محذوفة مخزنة محلياً');
        if(typeof renderAdmUsers==='function') renderAdmUsers();
        if(typeof updateAdmStats==='function') updateAdmStats();
      });
    },'🧹 نعم، طهّر');
  }
  window.adminPurgeDeletedUsers=adminPurgeDeletedUsers;

  // ── 4) تحديث مرآة السيرفر ──
  function _updateAdmServerMirror(rows){
    if(!rows){window._admServerUsers={}; return;}
    window._admServerUsers={};
    rows.forEach(function(row){
      if(!row || !row.phone) return;
      try{window._admServerUsers[normPhone(row.phone)]=rowToUser(row);}catch(e){}
    });
  }
  window._updateAdmServerMirror=_updateAdmServerMirror;

  // ── 5) تعديل pullUsers ──
  if(typeof pullUsers==='function'){
    var _origPullUsers=pullUsers;
    pullUsers=function(force){
      var admOpen=_isAdminOpen();
      if(admOpen || force){
        // مدير: جلب كل المستخدمين من السيرفر مباشرة + بناء مرآة كاملة
        return SB.select('users','select=*').then(function(rows){
          if(!rows) return false;
          _updateAdmServerMirror(rows);
          var local=JSON.parse(localStorage.getItem(LS_USERS)||'{}');
          var changed=false, delMap=(window.getDeletedUsersMap?getDeletedUsersMap():{}), serverPhones={};
          rows.forEach(function(row){
            if(!row || !row.phone) return;
            var rp=normPhone(row.phone); serverPhones[rp]=true;
            if(delMap[rp]){
              if(local[row.phone]){delete local[row.phone]; changed=true;}
              if(local[rp]){delete local[rp]; changed=true;}
              return;
            }
            try{
              var incoming=rowToUser(row);
              var isCur=_isCurrentPhone(row.phone);
              if(isCur){
                var cur=local[currentPhone] || local[row.phone] || local[rp] || incoming;
                cur.blocked=!!row.blocked;
                cur.isAgent=!!row.is_agent;
                if(row.wheel!=null) cur.wheel=Number(row.wheel);
                if(row.ref_count!=null) cur.refCount=Number(row.ref_count);
                if(row.team!=null) cur.team=Number(row.team);
                if(row.ref_charged!=null) cur.nexusRefCount=Number(row.ref_charged);
                if(row.ref_earnings!=null) cur.refEarnings=Number(row.ref_earnings);
                if(row.total_earnings!=null) cur.totalEarnings=Number(row.total_earnings);
                if(Number(row.balance)>(cur.balance||0)) cur.balance=Number(row.balance);
                else if(row.balance!=null && Number(row.balance)<(cur.balance||0)){
                  var recentLocalMoney=cur._lastLocalMoneyChangeAt && (Date.now()-Number(cur._lastLocalMoneyChangeAt)<180000);
                  var localTodayMore=(Number(cur.todayEarnings||0)>Number(row.today_earnings||0));
                  if(!(recentLocalMoney||localTodayMore)) cur.balance=Number(row.balance);
                }
                var rowPkgTs=Number(row.pkg_updated_at||0)||0, curPkgTs=pkgUpdateTs(cur);
                if(row.active_pkg!==undefined && row.active_pkg!==cur.activePkg && rowPkgTs>=curPkgTs){
                  cur.activePkg=row.active_pkg; cur._firstDepositDone=true; cur._pkgUpdatedAt=rowPkgTs;
                } else if(rowPkgTs>curPkgTs){cur._pkgUpdatedAt=rowPkgTs;}
                if(row.pkg_expiry!==undefined && row.pkg_expiry) cur.pkgExpiry=row.pkg_expiry;
                local[currentPhone]=cur; local[row.phone]=cur; local[rp]=cur;
              } else {
                local[row.phone]=incoming; local[rp]=incoming;
              }
              changed=true;
            }catch(e){}
          });
          Object.keys(delMap).forEach(function(ph){
            ph=normPhone(ph);
            if(local[ph] && !_isCurrentPhone(ph)){delete local[ph]; changed=true;}
          });
          if(changed) localStorage.setItem(LS_USERS,JSON.stringify(normalizeUsersMap(local)));
          return changed;
        }).catch(function(e){console.warn('[SYNC] pullUsers admin',e); return false;});
      } else {
        // مستخدم عادي: استخدم المنطق الأصلي مع تطهير إضافي
        return _origPullUsers(force).then(function(changed){
          var delMap=(window.getDeletedUsersMap?getDeletedUsersMap():{});
          if(Object.keys(delMap).length){
            var local=JSON.parse(localStorage.getItem(LS_USERS)||'{}');
            var cleaned=false;
            Object.keys(delMap).forEach(function(ph){
              ph=normPhone(ph);
              if(local[ph] && !_isCurrentPhone(ph)){delete local[ph]; cleaned=true;}
            });
            if(cleaned){localStorage.setItem(LS_USERS,JSON.stringify(normalizeUsersMap(local))); changed=true;}
          }
          return changed;
        });
      }
    };
  }

  // ── 6) تعديل tick: pullAppState قبل pullUsers ──
  if(typeof tick==='function'){
    var _origTick=tick;
    tick=function(){
      return pullAppState().then(function(){
        return _origTick();
      });
    };
  }

  // ── 7) تعديل openAdminPanel ──
  if(typeof openAdminPanel==='function'){
    var _origOpenAdminPanel=openAdminPanel;
    openAdminPanel=function(){
      var el=(typeof g==='function'?g('adminPanel'):document.getElementById('adminPanel'));
      if(!el) return;
      el.style.display='block';
      if(typeof updateAdmClock==='function') updateAdmClock();
      if(typeof _admClockInterval==='undefined' || !_admClockInterval) _admClockInterval=setInterval(updateAdmClock,30000);
      if(typeof admTab==='function') admTab('users');
      if(typeof updateAdmStats==='function') updateAdmStats();

      // جلب deleted_users أولاً ثم المستخدمين ثم الطلبات
      if(window.BRC_SYNC){
        BRC_SYNC.pullAppState().then(function(){
          return BRC_SYNC.pullUsers(true);
        }).then(function(){
          return BRC_SYNC.pullRequests();
        }).then(function(){
          try{
            if(typeof updateAdmStats==='function') updateAdmStats();
            if(typeof admCurrentTab!=='undefined' && admCurrentTab){
              if(admCurrentTab==='users' && typeof renderAdmUsers==='function') renderAdmUsers();
              else if(typeof admTab==='function') admTab(admCurrentTab);
            }
          }catch(e){}
        }).catch(function(){});
      }

      if(typeof _admAdminSyncInterval!=='undefined' && _admAdminSyncInterval) clearInterval(_admAdminSyncInterval);
      _admAdminSyncInterval=setInterval(function(){
        var el=document.getElementById('adminPanel');
        if(!el || el.style.display==='none') return;
        if(window.BRC_SYNC){
          BRC_SYNC.pullAppState().then(function(){return BRC_SYNC.pullUsers(true);}).then(function(){return BRC_SYNC.pullRequests();}).then(function(){
            if(typeof refreshAdminView==='function') refreshAdminView(false);
          }).catch(function(){});
        }
      },8000);
    };
  }

  // ── 8) جعل دوال رسم اللوحة تستخدم مرآة السيرفر ──
  function _wrapAdminRender(fnName){
    var fn=window[fnName];
    if(typeof fn!=='function') return;
    window[fnName]=function(){
      var _origGetUsers=getUsers;
      if(_isAdminOpen() && window._admServerUsers){
        getUsers=function(){ return normalizeUsersMap(window._admServerUsers); };
      }
      try{return fn.apply(this,arguments);}
      finally{getUsers=_origGetUsers;}
    };
  }
  ['renderAdmUsers','updateAdmStats','renderLevelsPanel','renderLevelUsersPanel','renderAgentsPanel','renderReferralsPanel','renderAdmPkgPanel','renderBulkPanel'].forEach(_wrapAdminRender);

  // ── 9) تحديث BRC_SYNC ──
  if(window.BRC_SYNC){
    window.BRC_SYNC.pullUsers=pullUsers;
    window.BRC_SYNC.tick=tick;
  }

  // ── 9.1) إعادة ضبط المؤقت الرئيسي ليستخدم tick الجديد ──
  try{
    if(typeof _syncTimer!=='undefined' && _syncTimer){
      clearInterval(_syncTimer);
      _syncTimer=setInterval(tick,7000);
      console.log('[ADMIN FIX] Sync timer reset to use new tick');
    }
  }catch(e){console.warn('[ADMIN FIX] _syncTimer reset',e);}

  // ── 10) تقوية دالة الحذف ──
  if(typeof adminDeleteUser==='function'){
    var _origAdminDeleteUser=adminDeleteUser;
    adminDeleteUser=function(){
      if(!currentAdminUser){toast && toast('⚠️ لا يوجد مستخدم'); return;}
      var uName=currentAdminUser.u && currentAdminUser.u.profile && currentAdminUser.u.profile.name || '—';
      var targetPhone=String(currentAdminUser.phone || '').trim();
      if(typeof currentPhone!=='undefined' && currentPhone && normPhone(currentPhone)===targetPhone){
        toast && toast('⚠️ حماية: لا يمكنك حذف حسابك الحالي من نفس الجلسة. استعمل حساب مدير آخر أو احظر الحساب فقط.');
        return;
      }
      if(typeof showConfirm!=='function') return;
      showConfirm('🗑️','حذف حساب '+uName+' نهائياً','⚠️ لا يمكن التراجع!\nهل أنت متأكد من مسح حساب '+uName+' نهائياً؟',function(){
        // 1) حذف محلي فوراً
        if(window.markDeletedUserLocal) window.markDeletedUserLocal(targetPhone);
        var users=getUsers(); delete users[targetPhone]; saveUsers(users);
        if(window._admServerUsers && window._admServerUsers[targetPhone]) delete window._admServerUsers[targetPhone];
        toast && toast('⏳ جاري حذف الحساب من السيرفر...');
        if(typeof closeAdminDetail==='function') closeAdminDetail();
        if(typeof renderAdmUsers==='function') renderAdmUsers();
        if(typeof updateAdmStats==='function') updateAdmStats();

        // 2) دفع الحذف إلى السيرفر ثم حذف الجداول
        _pushDeletedUserToServer(targetPhone).then(function(){
          if(typeof hardDeleteUserFromSupabase==='function') hardDeleteUserFromSupabase(targetPhone);
          var reqs=getReqs().filter(function(r){return normPhone(r.userId)!==targetPhone;}); saveReqs(reqs);
          if(normPhone(currentPhone)===targetPhone){clearSession(); localStorage.clear(); location.reload();}
          toast && toast('✅ تم حذف وتدمير حساب '+uName+' نهائياً');
          if(window.BRC_fastSync) window.BRC_fastSync(10);
        }).catch(function(){
          toast && toast('⚠️ تم الحذف محلياً، سيتم إعادة المحاولة مع السيرفر');
        });
      },'🗑️ نعم، حذف نهائياً');
    };
  }
})();
