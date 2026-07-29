// The single stylesheet for the DevJoke template. Injected by the Remotion
// composition (<style>{CSS}</style>) and by the preview renderer, so both
// targets are guaranteed to lay out identically.
export const CSS = `
  * { margin:0; padding:0; box-sizing:border-box; }
  .mb-stage { position:relative; width:1080px; height:1920px; overflow:hidden;
      font-family:'Liberation Sans','DejaVu Sans',Arial,sans-serif;
      -webkit-font-smoothing:antialiased;
      background:radial-gradient(1200px 900px at 50% 12%, #1B1E24 0%, #0F1012 62%); }

  /* ---------------- browser frame ---------------- */
  .browser { position:absolute; left:40px; top:430px; width:1000px; height:1230px;
             background:#fff; border-radius:26px; overflow:hidden;
             box-shadow:0 40px 90px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.06); }
  .chrome { height:64px; background:#EDEFF3; border-bottom:1px solid #DDE2EA;
            display:flex; align-items:center; padding:0 22px; gap:11px; }
  .dot { width:14px; height:14px; border-radius:50%; display:block; }
  .urlpill { margin-left:22px; height:34px; flex:1; background:#fff; border:1px solid #DDE2EA;
             border-radius:17px; display:flex; align-items:center; padding:0 18px;
             font-size:19px; color:#6B7382; }
  .viewport { position:relative; height:1166px; overflow:hidden; background:#fff; }
  .site { position:relative; width:1000px; will-change:transform; }

  /* ---------------- mock client site ---------------- */
  .nav { position:relative; border-bottom:1px solid #E4E8EF; }
  .navitems { position:absolute; display:flex; align-items:center; gap:26px; white-space:nowrap; }
  .ni { font-size:23px; color:#5A6472; font-weight:500; }
  .cta { font-size:23px; font-weight:700; color:#fff; background:#6B4EFF;
         padding:12px 22px; border-radius:11px; }

  .logo { position:absolute; display:flex; align-items:center; z-index:5;
          font-weight:700; color:#0D1116; line-height:1; white-space:nowrap; }

  .hero { position:relative; padding:44px 44px 52px; }
  .eyebrow { font-size:21px; letter-spacing:3.4px; font-weight:700; color:#6B4EFF; }
  .hero h1 { position:relative; z-index:6; font-size:76px; line-height:1.05; letter-spacing:-1.6px;
             color:#0D1116; margin-top:14px; }
  .hero p { position:relative; z-index:6; font-size:29px; color:#5A6472; margin-top:20px; }
  .btnrow { display:flex; gap:16px; margin-top:32px; position:relative; z-index:6; }
  .btn { font-size:25px; font-weight:700; padding:16px 32px; border-radius:12px; }
  .btn.primary { background:#0D1116; color:#fff; }
  .btn.ghost { background:#fff; color:#0D1116; border:2px solid #E4E8EF; }
  .heroimg { position:relative; margin-top:34px; border-radius:18px; overflow:hidden;
             background:linear-gradient(120deg,#EEF0FF 0%,#F6F1FF 55%,#EAF3FF 100%);
             border:1px solid #E4E8EF; }
  .hi-a,.hi-b,.hi-c { position:absolute; border-radius:12px; }
  .hi-a { left:40px; top:34px; width:300px; height:24px; background:#CFD6FF; }
  .hi-b { left:40px; top:76px; width:200px; height:24px; background:#DFE3FF; }
  .hi-c { right:44px; top:34px; width:210px; height:170px; background:#C9BFFF; border-radius:16px; }

  .features { display:flex; gap:18px; padding:0 44px 8px; }
  .fcard { flex:1; border:1px solid #E4E8EF; border-radius:16px; padding:24px; background:#FBFCFE; }
  .fdot { width:34px; height:34px; border-radius:10px; }
  .ftitle { font-size:27px; font-weight:700; color:#0D1116; margin:16px 0 14px; }
  .fline { height:11px; border-radius:6px; background:#EAEEF4; margin-bottom:9px; }
  .w1{width:100%} .w2{width:82%} .w3{width:60%}

  .stats { display:flex; margin:40px 44px; border:1px solid #E4E8EF; border-radius:16px; overflow:hidden; }
  .stat { flex:1; padding:30px; text-align:center; border-right:1px solid #E4E8EF; }
  .stat:last-child { border-right:none; }
  .sv { font-size:46px; font-weight:700; color:#0D1116; letter-spacing:-1px; }
  .sl { font-size:20px; color:#8B94A3; margin-top:6px; }
  .foot { display:flex; gap:36px; padding:30px 44px 70px; border-top:1px solid #E4E8EF;
          font-size:21px; color:#8B94A3; }

  /* ---------------- overlays ---------------- */
  .chip { position:absolute; right:60px; top:296px; transform-origin:100% 50%;
          background:#FFB020; color:#191919; font-size:46px; font-weight:700;
          letter-spacing:2px; padding:16px 30px; border-radius:14px;
          box-shadow:0 12px 34px rgba(255,176,32,.28); }

  .hookscrim { position:absolute; inset:0;
               background:linear-gradient(180deg, rgba(15,16,18,.98) 0%, rgba(15,16,18,.96) 19%, rgba(15,16,18,.60) 26%, rgba(15,16,18,.46) 40%, rgba(15,16,18,.46) 100%); }
  .hook { position:absolute; left:0; right:0; top:96px; text-align:center; }
  .hooktext { font-size:96px; font-weight:700; line-height:1.06; letter-spacing:-1.5px; color:#fff; }
  .hooksub { margin-top:26px; font-size:44px; color:#FFB020; font-weight:700; letter-spacing:1px; }

  .aside { position:absolute; left:0; right:0; top:1698px; text-align:center;
           font-size:62px; font-weight:700; color:#fff; letter-spacing:-.5px; }

  .lockup { position:absolute; left:48px; bottom:44px; display:flex; align-items:center; gap:14px;
            font-size:30px; font-weight:700; color:rgba(255,255,255,.62); letter-spacing:.4px; }
  .lmark { width:24px; height:24px; border-radius:7px; background:#3B6DF6; display:block; }

  .payoff { position:absolute; inset:0; }
  .payoffscrim { position:absolute; inset:0;
                 background:radial-gradient(700px 700px at 50% 47%, rgba(9,12,10,.62) 0%, rgba(9,12,10,.80) 100%); }
  .tickwrap { position:absolute; left:0; right:0; top:770px; display:flex; justify-content:center;
              filter:drop-shadow(0 18px 60px rgba(34,197,94,.55)); }
  .payofftext { position:absolute; left:0; right:0; top:1660px; text-align:center;
                font-size:84px; font-weight:700; color:#fff; letter-spacing:-1px; }

  /* ---------------- chat panel ---------------- */
  .chat { position:absolute; inset:0;
          background:linear-gradient(180deg,#151821 0%,#101219 100%); padding:700px 70px 0; }
  .chead { display:flex; align-items:center; gap:14px; padding-bottom:34px;
           border-bottom:1px solid rgba(255,255,255,.10); }
  .chash { font-size:46px; color:#5C6577; font-weight:700; }
  .cname { font-size:46px; color:#fff; font-weight:700; }
  .cmeta { font-size:28px; color:#6B7488; margin-left:16px; }
  .crow { display:flex; gap:28px; margin-top:70px; }
  .initials { width:96px; height:96px; border-radius:22px; flex:none; background:#6B4EFF;
              color:#fff; font-size:38px; font-weight:700; display:flex;
              align-items:center; justify-content:center; letter-spacing:1px; }
  .cbody { flex:1; }
  .cwho { font-size:34px; font-weight:700; color:#E6E9F0; margin-bottom:22px; }
  .ctime { font-size:26px; color:#6B7488; font-weight:400; margin-left:14px; }
  .bubble { display:inline-block; transform-origin:0 50%; background:#20242F; color:#fff;
            font-size:56px; line-height:1.32; padding:32px 38px; border-radius:22px;
            border:1px solid rgba(255,255,255,.08); max-width:800px; min-height:120px; }
  .bubble.ghost { display:flex; align-items:center; gap:18px; }
  .tdot { width:20px; height:20px; border-radius:50%; background:#8B94A3; display:block; }
  .caret { display:inline-block; width:4px; height:52px; background:#fff;
           vertical-align:-8px; margin-left:6px; }
  .cstatus { display:flex; align-items:center; gap:16px; margin-top:56px;
             font-size:40px; color:#8B94A3; }
  .cstatus .tdot { width:14px; height:14px; }

  /* ---------------- end card (identical on all 30 videos) ---------------- */
  .endcard { position:absolute; inset:0; background:#191919;
             display:flex; flex-direction:column; align-items:center; justify-content:center; gap:56px; }
  .ecmark { line-height:0; }
  .ecwords { text-align:center; }
  .ecname { font-size:70px; font-weight:700; color:#fff; letter-spacing:-1px; }
  .ecurl { font-size:44px; color:#9AA3B2; margin-top:18px; letter-spacing:.5px; }
`;
