// THE EXECUTIVE ORDER - campaign screens. Loaded by index.html AFTER its main script; uses its globals (sb, session, state, esc, $, notice, worldView).
// Every NPC message shows where it came from: "Scripted" now, "AI-generated" if an AI responder is ever switched on.
(() => {
  const COST = { speech: [3, 0], rally: [5, 15000], interview: [2, 0], debate: [4, 0], rival: [2, 0], citizen: [1, 0] };
  const ACTS = [["speech", "Give a speech", "Address voters in one region."], ["rally", "Hold a rally", "A big event: bigger effect, costs funds."], ["interview", "Press interview", "Questions from a journalist."],
    ["debate", "TV debate", "Face an AI rival on national TV."], ["rival", "Rival exchange", "A public clash with a rival."], ["citizen", "Meet a voter", "Listen to a citizen's concern."]];
  const KIND = { speech: "Speech", rally: "Rally", interview: "Press interview", debate: "TV debate", rival: "Rival exchange", citizen: "Voter meeting" };
  const STANCES = [[-2, "Market-led: leave it to private business"], [-1, "Lean on private investment"], [0, "Balanced approach"], [1, "Expand public programmes"], [2, "State-led: government in charge"]];
  const PRIORITIES = [[0, "Not a focus"], [1, "Minor"], [2, "Important"], [3, "Top priority"]];
  const num = (v) => Number(v ?? 0), f1 = (v) => num(v).toFixed(1), money = (v) => num(v).toLocaleString("en");
  const nl = (t) => esc(t).replace(/\n/g, "<br>");
  const chips = (e) => (e ? [["Popularity", e.popularity], ["Credibility", e.credibility], ["Media", e.media_goodwill], ["Momentum", e.momentum]].filter((x) => num(x[1]) !== 0)
    .map((x) => `<span class="chip2 ${num(x[1]) > 0 ? "up" : "down"}">${x[0]} ${num(x[1]) > 0 ? "+" : ""}${f1(x[1])}</span>`).join("") : "");
  const srcBadge = (s) => (s === "ai" ? '<span class="src ai">AI-generated</span>' : s === "scripted" ? '<span class="src scripted">Scripted</span>' : "");
  const cur = () => (state.cmp && state.cmp.worldId === state.worldId ? state.cmp : (state.cmp = { worldId: state.worldId, view: "home" }));
  const msgHtml = (c) => { const m = c.msg; c.msg = null; return m ? `<div class="msg ${m.t}" role="alert">${esc(m.m)}</div>` : ""; };

  async function call(body) {
    const { data, error } = await sb.functions.invoke("campaign", { body });
    if (error) { let m = error.message; try { m = (await error.context.json()).error || m; } catch {} throw new Error(m); }
    if (data && data.error) throw new Error(data.error);
    return data;
  }
  async function act(el, ctx, c, btn, fn) {
    if (btn) btn.disabled = true;
    try { if ((await fn()) === "skip") return; } catch (e) { c.msg = { t: "err", m: e.message || "Something went wrong." }; }
    await mount(el, ctx);
  }

  async function mount(el, ctx) {
    const c = cur();
    try {
      if (ctx.world.status === "setup") return await setupView(el, ctx, c);
      if (ctx.world.status !== "campaign") { el.innerHTML = `${msgHtml(c)}<div class="panel"><h3>The campaign season is over</h3><p class="muted">Election results arrive in a later phase.</p></div>`; return; }
      if (c.view === "speech") return await speechView(el, ctx, c);
      if (c.view === "thread") return await threadView(el, ctx, c);
      return await homeView(el, ctx, c);
    } catch (e) { el.innerHTML = `<div class="msg err">${esc(e.message || "Could not load the campaign.")}</div>`; }
  }

  // ---------- before the campaign opens: manifesto ----------
  async function setupView(el, ctx, c) {
    const { world, me, isOwner } = ctx; let editor = "", issues = [];
    if (!me) editor = '<div class="panel"><h3>Your manifesto</h3><p class="muted">Register as a presidential candidate first (see Run for president). Then build your manifesto here.</p></div>';
    else {
      const [iss, pos] = await Promise.all([sb.from("campaign_issues").select("*"), sb.from("candidate_positions").select("*").eq("character_id", me.id)]);
      if (iss.error) throw iss.error;
      issues = iss.data || [];
      const byKey = Object.fromEntries((pos.data || []).map((p) => [p.issue_key, p]));
      editor = `<div class="panel"><h3>Your manifesto</h3><p class="muted">Choose where you stand on each issue. Journalists and rivals will quote this back at you, and changing it after the campaign opens counts as a public U-turn.</p><form id="mfs">${issues.map((i) => {
        const p = byKey[i.key] || { stance: 0, priority: 1, statement: "" };
        return `<div class="issue"><h3>${esc(i.label)}</h3><label for="st_${esc(i.key)}">Your approach</label><select id="st_${esc(i.key)}">${STANCES.map((s) => `<option value="${s[0]}" ${s[0] === p.stance ? "selected" : ""}>${esc(s[1])}</option>`).join("")}</select>
        <label for="pr_${esc(i.key)}">How important is it to you?</label><select id="pr_${esc(i.key)}">${PRIORITIES.map((s) => `<option value="${s[0]}" ${s[0] === p.priority ? "selected" : ""}>${esc(s[1])}</option>`).join("")}</select>
        <label for="sm_${esc(i.key)}">In your own words (optional, up to 300 characters)</label><input id="sm_${esc(i.key)}" maxlength="300" value="${esc(p.statement)}"></div>`; }).join("")}
        <div style="margin-top:1rem"><button type="submit" id="mfsave">Save manifesto</button></div></form></div>`;
    }
    const start = isOwner ? '<div class="panel"><h3>Open the campaign</h3><p class="muted">When everyone is ready, open the campaign season. Candidate registration closes and manifestos are locked.</p><button id="startc">Open the campaign</button></div>'
      : '<div class="panel"><p class="muted">The nation owner opens the campaign season when everyone is ready.</p></div>';
    el.innerHTML = `${msgHtml(c)}${editor}${start}`;
    const f = $("#mfs");
    if (f) f.onsubmit = (e) => { e.preventDefault(); act(el, ctx, c, e.submitter, async () => {
      for (const i of issues) {
        const { error } = await sb.rpc("set_position", { p_world: world.id, p_issue: i.key, p_stance: Number($("#st_" + i.key).value), p_priority: Number($("#pr_" + i.key).value), p_statement: $("#sm_" + i.key).value });
        if (error) throw error;
      }
      c.msg = { t: "ok", m: "Manifesto saved." };
    }); };
    const sbtn = $("#startc");
    if (sbtn) sbtn.onclick = () => { if (!confirm("Open the campaign season? Candidate registration closes and manifestos are locked.")) return;
      act(el, ctx, c, sbtn, async () => { const { error } = await sb.rpc("start_campaign", { p_world: world.id }); if (error) throw error; notice("ok", "The campaign season is open."); await worldView(); return "skip"; }); };
  }

  // ---------- the campaign dashboard ----------
  async function homeView(el, ctx, c) {
    const { world, me, regions, chars, parties } = ctx;
    const [mx, rs, sup, ev, th] = await Promise.all([
      sb.from("campaign_metrics").select("*").eq("world_id", world.id),
      me ? sb.from("campaign_resources").select("*").eq("character_id", me.id).maybeSingle() : { data: null },
      me ? sb.from("campaign_region_support").select("region_id,support").eq("character_id", me.id) : { data: [] },
      sb.from("campaign_events").select("*").eq("world_id", world.id).order("created_at", { ascending: false }).limit(15),
      me ? sb.from("campaign_threads").select("id,kind,status,npc_id,turn_count,max_turns,created_at").eq("character_id", me.id).order("created_at", { ascending: false }).limit(8) : { data: [] },
    ]);
    const metrics = mx.data || [], mine = me ? metrics.find((m) => m.character_id === me.id) : null, res = rs.data;
    const partyBy = Object.fromEntries((parties || []).map((p) => [p.id, p]));
    const standings = (chars || []).filter((x) => x.kind === "candidate").map((x) => ({ x, m: metrics.find((m) => m.character_id === x.id) })).filter((r) => r.m).sort((a, b) => num(b.m.popularity) - num(a.m.popularity));
    const myBlock = me && mine && res ? `<div class="panel"><h2>Campaign · Day ${esc(world.campaign_day)}</h2><p class="muted">You are campaigning as ${esc(me.name)}.</p>
      <div class="stats"><div class="stat">Popularity<b>${f1(mine.popularity)}</b></div><div class="stat">Credibility<b>${f1(mine.credibility)}</b></div><div class="stat">Media goodwill<b>${f1(mine.media_goodwill)}</b></div><div class="stat">Momentum<b>${f1(mine.momentum)}</b></div>
      <div class="stat">Energy<b>${esc(res.energy)}</b></div><div class="stat">Campaign funds<b>${money(res.funds)}</b></div></div>
      <h3 style="margin-top:1rem">Support by state</h3>${(sup.data || []).map((s) => { const r = regions.find((x) => x.id === s.region_id); return `<div class="rrow"><span>${esc(r?.name || "")}</span><span>${f1(s.support)}%</span></div><div class="bar"><i style="width:${Math.max(0, Math.min(100, num(s.support)))}%"></i></div>`; }).join("")}</div>`
      : `<div class="panel"><h2>Campaign · Day ${esc(world.campaign_day)}</h2><p class="muted">${me ? "Your campaign numbers are not set up." : "You are watching this campaign. Register before the campaign opens to take part."}</p></div>`;
    const acts = me && mine && res ? `<div class="panel"><h3>Campaign activities</h3><p class="muted">Each activity costs energy. Be specific, honest and consistent with your manifesto.</p>
      ${ACTS.map((a) => { const [ce, cf] = COST[a[0]], poor = num(res.energy) < ce || num(res.funds) < cf;
        return `<div class="row" style="justify-content:space-between;border-top:1px solid var(--navy3);padding:.5rem 0"><div><strong>${esc(a[1])}</strong><div class="muted">${esc(a[2])} Costs ${ce} energy${cf ? ` and ${money(cf)} funds` : ""}.</div></div><button class="ghost" data-act="${a[0]}" ${poor ? "disabled" : ""}>Start</button></div>`; }).join("")}</div>` : "";
    const open = (th.data || []).filter((t) => t.status === "open");
    const unfinished = open.length ? `<div class="panel"><h3>Unfinished conversations</h3>${open.map((t) => `<div class="row" style="justify-content:space-between;padding:.4rem 0"><span>${esc(KIND[t.kind] || t.kind)} <span class="muted">· ${esc(t.turn_count)} of ${esc(t.max_turns)} replies</span></span><button class="ghost" data-th="${esc(t.id)}">Continue</button></div>`).join("")}</div>` : "";
    el.innerHTML = `${msgHtml(c)}${myBlock}${acts}${unfinished}
      <div class="panel"><h3>Standings</h3><p class="muted">Public poll numbers. Only you can see your own energy and funds.</p>${standings.map((r, i) => `<div class="row" style="justify-content:space-between;padding:.35rem 0"><span>${i + 1}. <span class="chip" style="background:${hex(partyBy[r.x.party_id]?.colour)}"></span>${esc(r.x.name)} <span class="badge">${r.x.is_ai ? "AI" : "Human"}</span></span><span>${f1(r.m.popularity)} <span class="muted">cred ${f1(r.m.credibility)}</span></span></div>`).join("") || '<p class="muted">No standings yet.</p>'}</div>
      <div class="panel"><h3>National news</h3>${(ev.data || []).map((e) => `<p>${esc(e.summary)} <span class="muted">Day ${esc(e.campaign_day)}</span></p>`).join("") || '<p class="muted">Nothing has happened yet. Make some news.</p>'}</div>`;
    el.querySelectorAll("[data-act]").forEach((b) => (b.onclick = () => {
      const k = b.dataset.act;
      if (k === "speech" || k === "rally") { c.view = "speech"; c.rally = k === "rally"; c.result = null; return mount(el, ctx); }
      act(el, ctx, c, b, async () => { const r = await call({ action: "begin", kind: k, world_id: world.id }); c.view = "thread"; c.threadId = r.thread_id; c.notice = r.notice || null; });
    }));
    el.querySelectorAll("[data-th]").forEach((b) => (b.onclick = () => { c.view = "thread"; c.threadId = b.dataset.th; mount(el, ctx); }));
  }

  // ---------- speeches and rallies ----------
  async function speechView(el, ctx, c) {
    const { world, regions } = ctx;
    if (c.result) {
      const r = c.result;
      el.innerHTML = `${msgHtml(c)}<div class="panel"><h3>${c.resultRally ? "Your rally" : "Your speech"}</h3><div class="bubble npc"><div class="who">The crowd ${srcBadge(r.source)}</div><div>${nl(r.text)}</div></div>
        <p>${chips(r.effects) || '<span class="muted">No change in your numbers.</span>'}</p>${r.notice ? `<p class="muted">${esc(r.notice)}</p>` : ""}<button id="cback">Back to the campaign</button></div>`;
      $("#cback").onclick = () => { c.view = "home"; c.result = null; mount(el, ctx); };
      return;
    }
    el.innerHTML = `${msgHtml(c)}<div class="panel"><button class="ghost" id="cback">Back</button><h3 style="margin-top:.75rem">${c.rally ? "Hold a rally" : "Give a speech"}</h3>
      <p class="muted">A speech costs 3 energy. A rally costs 5 energy and 15,000 funds, and has a bigger effect. Be specific, mention real plans, and speak to what people in that region care about. Aim for 25 words or more.</p>
      <form id="spf"><label for="spr">Region</label><select id="spr">${regions.map((r) => `<option value="${esc(r.id)}" ${r.id === ctx.me?.region_id ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select>
      <label for="spt">Your speech</label><textarea id="spt" required maxlength="2000" rows="7"></textarea>
      <label class="chk"><input type="checkbox" id="spy" ${c.rally ? "checked" : ""}> This is a rally</label><div style="margin-top:1rem"><button type="submit">Deliver it</button></div></form></div>`;
    $("#cback").onclick = () => { c.view = "home"; mount(el, ctx); };
    $("#spf").onsubmit = (e) => { e.preventDefault(); act(el, ctx, c, e.submitter, async () => {
      const rally = !!$("#spy").checked;
      const r = await call({ action: "speech", world_id: world.id, region_id: $("#spr").value, text: $("#spt").value, rally });
      c.result = r; c.resultRally = rally;
    }); };
  }

  // ---------- one conversation: interview, debate, rival exchange, voter meeting ----------
  async function threadView(el, ctx, c) {
    const { data: th, error } = await sb.from("campaign_threads").select("*").eq("id", c.threadId).maybeSingle();
    if (error || !th) { c.view = "home"; throw new Error(error ? error.message : "That conversation was not found."); }
    const { data: turns } = await sb.from("campaign_turns").select("*").eq("thread_id", th.id).order("seq", { ascending: true });
    let npc = (ctx.chars || []).find((x) => x.id === th.npc_id);
    if (!npc && th.npc_id) npc = (await sb.from("characters").select("id,name").eq("id", th.npc_id).maybeSingle()).data;
    const npcName = npc?.name || "The interviewer", left = Math.max(0, num(th.max_turns) - num(th.turn_count));
    el.innerHTML = `${msgHtml(c)}<div class="panel"><button class="ghost" id="cback">Back to the campaign</button><h3 style="margin-top:.75rem">${esc(KIND[th.kind] || th.kind)} with ${esc(npcName)}</h3>
      <p class="muted">${th.status === "open" ? `${left} ${left === 1 ? "reply" : "replies"} left.` : "This conversation has ended. Only you can read it."}</p>
      ${(turns || []).map((t) => t.speaker === "npc" ? `<div class="bubble npc"><div class="who">${esc(npcName)} ${srcBadge(t.source)}</div><div>${nl(t.body)}</div></div>`
        : `<div class="bubble you"><div class="who">You</div><div>${nl(t.body)}</div><div>${chips(t.effects)}</div></div>`).join("")}
      ${th.status === "open" ? `<form id="rpl"><label for="rpt">Your answer</label><textarea id="rpt" required maxlength="2000" rows="5"></textarea><div style="margin-top:.75rem"><button type="submit">Answer</button></div></form>` : ""}</div>`;
    $("#cback").onclick = () => { c.view = "home"; mount(el, ctx); };
    const f = $("#rpl");
    if (f) f.onsubmit = (e) => { e.preventDefault(); act(el, ctx, c, e.submitter, async () => { await call({ action: "reply", thread_id: th.id, text: $("#rpt").value }); }); };
  }

  window.CampaignUI = { mount };
})();
