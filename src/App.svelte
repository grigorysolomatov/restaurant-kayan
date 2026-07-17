<script>
  import { onMount, tick } from 'svelte';

  const BASE = import.meta.env.BASE_URL; // e.g. /restaurant-kayan/

  // ---- world scaling (keeps the whole scene visible on any device) ----
  const WORLD_W = 1280;
  const WORLD_H = 760;
  let scale = 1;
  function fit() {
    scale = Math.min(window.innerWidth / WORLD_W, window.innerHeight / WORLD_H);
  }

  // ---- fixed world positions ----
  const POND_X = 360;    // fisherman idle spot (by the pond)
  const MARKET_X = 720;  // where the fisherman stands to sell
  const BURST_X = 880;   // coin fireworks origin
  const BURST_Y = 320;

  // ---- game state ----
  let money = 0;
  let caught = 0;
  let streak = 0;

  let a = 2, b = 2, op = '+', answer = 4;
  let input = '';
  let feedback = '';
  let feedbackKind = ''; // 'ok' | 'bad'

  const PRICE_PER_KG = 10;   // market pays $10 per kg

  // current fish in the pond
  let armed = false;         // fish hooked, fight is on
  let biting = false;
  let fishScale = 1;         // visual scale in the pond, from the answer/weight
  let fishWeight = 0;        // kg — equals the puzzle answer
  let fishValue = 0;         // sale price = weight * PRICE_PER_KG
  let hit = false;           // brief shake on each tap

  // reel-in tug-of-war
  let fighting = false;
  let catchProgress = 50;    // 0 = fish lost, 100 = fish caught; starts at half
  let drainPerSec = 15;      // how fast the bar drains
  let tapGain = 15;          // how much each tap adds (smaller for bigger fish)
  let rafId = null;
  let lastT = 0;

  // fisherman state machine: idle -> carrying -> selling -> returning -> idle
  let fisherState = 'idle';
  let fishermanX = POND_X;
  let walking = false;
  let carryFish = null;      // {size}
  $: busy = fisherState !== 'idle';

  // coin fireworks + money popup
  let coins = [];
  let coinId = 0;
  let showPop = false;
  let popValue = 0;

  // "caught!" weight banner
  let showCaught = false;
  let caughtWeight = 0;

  let inputEl;

  function rnd(n) { return Math.floor(Math.random() * n); }

  function newProblem() {
    const ops = ['+', '-', '×'];
    op = ops[rnd(ops.length)];
    if (op === '+') { a = rnd(12) + 1; b = rnd(12) + 1; answer = a + b; }
    else if (op === '-') { a = rnd(12) + 6; b = rnd(a); answer = a - b; }
    else { a = rnd(8) + 2; b = rnd(8) + 2; answer = a * b; }
    input = '';
  }

  // The answer is the fish's weight in kg — it decides size, fight and price.
  function makeFish() {
    const w = answer;
    const t = Math.min(w, 80) / 80;                 // 0 .. 1 heaviness
    fishWeight = w;
    fishScale = 0.6 + t * 2.4;                       // ~0.6 .. 3.0 (clearly varies)
    drainPerSec = 12 + t * 10;                       // heavier fish pull harder (12..22)
    tapGain = Math.max(7, 22 - t * 15);              // heavier fish give less per tap (22..7)
    fishValue = w * PRICE_PER_KG;
  }

  function submit() {
    if (busy) return;
    if (armed) { flash('Reel your fish in first! 🎣', 'ok'); return; }
    const raw = String(input ?? '').trim();
    if (raw === '') { flash('Type an answer!', 'bad'); return; }
    if (parseInt(raw, 10) === answer) {
      streak += 1;
      makeFish();
      armed = true;
      biting = true;
      const big = fishScale > 2.1 ? ' A whopper! 🐟' : '';
      flash(`Correct!${big} Tap fast to reel it in!`, 'ok');
      startFight();
    } else {
      streak = 0;
      flash(`Oops! It was ${answer}. Try this one.`, 'bad');
      newProblem();
      focusInput();
    }
  }

  function flash(msg, kind) {
    feedback = msg;
    feedbackKind = kind;
  }

  async function focusInput() {
    await tick();
    inputEl && inputEl.focus();
  }

  // ---- reel-in tug-of-war ----
  function startFight() {
    catchProgress = 50;
    fighting = true;
    lastT = performance.now();
    rafId = requestAnimationFrame(fightTick);
  }

  function stopFight() {
    fighting = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function fightTick(t) {
    if (!fighting) return;
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    catchProgress -= drainPerSec * dt;
    if (catchProgress <= 0) { catchProgress = 0; loseFish(); return; }
    if (catchProgress >= 100) { catchProgress = 100; landFish(); return; }
    rafId = requestAnimationFrame(fightTick);
  }

  // each tap pulls the fish in a little (less for heavy fish)
  function tapFish() {
    if (!armed || !fighting) { if (!armed) flash('Solve the math first! 🧮', 'bad'); return; }
    catchProgress = Math.min(100, catchProgress + tapGain);
    hit = true;
    setTimeout(() => (hit = false), 120);
    if (catchProgress >= 100) landFish();
  }

  function loseFish() {
    stopFight();
    armed = false;
    biting = false;
    streak = 0;
    flash(`The ${fishWeight} kg fish got away! 🌊`, 'bad');
    setTimeout(() => { newProblem(); focusInput(); }, 700);
  }

  // Fish is landed — the fisherman carries it to market.
  function landFish() {
    stopFight();
    armed = false;
    biting = false;
    carryFish = { size: fishScale };
    caughtWeight = fishWeight;
    popCaught();
    fisherState = 'carrying';
    walking = true;
    fishermanX = MARKET_X;
    flash(`Caught a ${fishWeight} kg fish! Off to market… 🚶`, 'ok');
    setTimeout(sellAtMarket, 1250);
  }

  function sellAtMarket() {
    fisherState = 'selling';
    walking = false;
    money += fishValue;
    caught += 1;
    spawnCoins();
    popMoney(fishValue);
    flash(`Sold ${fishWeight} kg for $${fishValue} ($${PRICE_PER_KG}/kg)! 💰`, 'ok');
    setTimeout(returnHome, 1050);
  }

  function returnHome() {
    carryFish = null;
    fisherState = 'returning';
    walking = true;
    fishermanX = POND_X;
    setTimeout(() => {
      fisherState = 'idle';
      walking = false;
      newProblem();
      focusInput();
    }, 1250);
  }

  function spawnCoins() {
    const burst = [];
    for (let i = 0; i < 16; i++) {
      const ang = Math.PI * (0.15 + Math.random() * 0.7); // upward arc
      const spd = 70 + Math.random() * 110;
      burst.push({
        id: coinId++,
        dx: Math.cos(ang) * spd * (Math.random() < 0.5 ? -1 : 1),
        dy: -Math.sin(ang) * spd,
        e: Math.random() < 0.5 ? '🪙' : '💰',
      });
    }
    coins = [...coins, ...burst];
    const ids = new Set(burst.map((b) => b.id));
    setTimeout(() => { coins = coins.filter((c) => !ids.has(c.id)); }, 1200);
  }

  function popMoney(value) {
    popValue = value;
    showPop = false;
    // retrigger the mount animation
    requestAnimationFrame(() => { showPop = true; });
    setTimeout(() => (showPop = false), 1300);
  }

  function popCaught() {
    showCaught = false;
    requestAnimationFrame(() => { showCaught = true; });
    setTimeout(() => (showCaught = false), 1400);
  }

  function onKey(e) {
    if (e.key === 'Enter') submit();
  }

  // ---- preload all art before showing the game ----
  const ASSETS = ['pond.png', 'shark.png', 'fisherman.png', 'fish-marked.png'];
  let ready = false;
  let loadedCount = 0;

  function preload() {
    return Promise.all(
      ASSETS.map(
        (name) =>
          new Promise((resolve) => {
            const img = new Image();
            const done = () => { loadedCount += 1; resolve(); };
            img.onload = done;
            img.onerror = done;
            img.src = BASE + 'assets/' + name;
          })
      )
    );
  }

  onMount(() => {
    fit();
    newProblem();
    window.addEventListener('resize', fit);
    preload().then(() => { ready = true; focusInput(); });
    return () => window.removeEventListener('resize', fit);
  });
</script>

<div class="stage">
  {#if !ready}
    <div class="loading">
      <div class="spinner">🎣</div>
      <div class="loading-title">Restaurant Kayan</div>
      <div class="loading-bar"><span style="width:{(loadedCount / ASSETS.length) * 100}%"></span></div>
      <div class="loading-sub">Loading the pond…</div>
    </div>
  {/if}

  <div
    class="world"
    class:hidden={!ready}
    style="width:{WORLD_W}px;height:{WORLD_H}px;transform:translate(-50%,-50%) scale({scale});"
  >
    <!-- sky & scenery -->
    <div class="sky"></div>
    <div class="sun"></div>
    <div class="cloud c1"></div>
    <div class="cloud c2"></div>
    <div class="cloud c3"></div>
    <div class="hill h1"></div>
    <div class="hill h2"></div>
    <div class="ground"></div>
    <div class="path"></div>

    <!-- HUD -->
    <div class="hud">
      <div class="chip">💰 <b>${money}</b></div>
      <div class="chip">🐟 <b>{caught}</b></div>
      <div class="chip">🔥 <b>{streak}</b></div>
    </div>

    <h1 class="banner">🎣 Restaurant Kayan</h1>

    <!-- LEFT: the pond -->
    <div class="pond-area">
      <img class="pond-img" src="{BASE}assets/pond.png" alt="Pond" />
      {#if !busy}
        <div
          class="shark {armed ? 'armed' : ''} {biting ? 'biting' : ''} {hit ? 'hit' : ''}"
          style="width:{120 * (armed ? fishScale : 1)}px;"
          on:click={tapFish}
          on:keydown={(e) => e.key === 'Enter' && tapFish()}
          role="button"
          tabindex="0"
          aria-label="Tap to reel in the fish"
        >
          <img src="{BASE}assets/shark.png" alt="Fish" />
          {#if armed}<div class="ring"></div>{/if}
        </div>
        {#if armed}
          <div class="fight-ui">
            <div class="fight-label">🐟 {fishWeight} kg — tap to reel it in!</div>
            <div class="fight-bar">
              <span
                style="width:{catchProgress}%; background:hsl({Math.round(catchProgress * 1.2)}, 85%, 45%);"
              ></span>
            </div>
          </div>
        {/if}
      {/if}
      {#if showCaught}
        <div class="caught-banner">🎣 Caught a {caughtWeight} kg fish!</div>
      {/if}
    </div>

    <!-- the fisherman (walks to the market to sell) -->
    <div class="fisher {walking ? 'walking' : ''}" style="left:{fishermanX}px;">
      <img class="fisher-img" src="{BASE}assets/fisherman.png" alt="Fisherman" />
      {#if carryFish}
        <div class="carry" style="width:{80 * Math.min(carryFish.size, 2.4)}px;">
          <img src="{BASE}assets/shark.png" alt="Caught fish" />
        </div>
      {/if}
    </div>

    <!-- CENTER: the math sign -->
    <div class="math-post">
      <div class="post-leg l"></div>
      <div class="post-leg r"></div>
      <div class="board">
        <div class="board-title">Math Catch</div>
        <div class="equation">{a} {op} {b} = ?</div>
        <div class="entry">
          <input
            bind:this={inputEl}
            bind:value={input}
            on:keydown={onKey}
            type="number"
            inputmode="numeric"
            pattern="[0-9]*"
            placeholder="?"
            aria-label="Your answer"
            disabled={busy || armed}
          />
          <button class="go" on:click={submit} disabled={busy || armed}>Cast</button>
        </div>
        <div class="feedback {feedbackKind}">{feedback || ' '}</div>
      </div>
    </div>

    <!-- RIGHT: the market / restaurant -->
    <div class="market">
      <img class="market-img" src="{BASE}assets/fish-marked.png" alt="Restaurant Kayan" />
      <div class="market-basket">🧺</div>
    </div>

    <!-- coin fireworks + money popup -->
    <div class="burst" style="left:{BURST_X}px;top:{BURST_Y}px;">
      {#each coins as c (c.id)}
        <span class="coin" style="--dx:{c.dx}px;--dy:{c.dy}px;">{c.e}</span>
      {/each}
      {#if showPop}
        <div class="money-pop">+${popValue}</div>
      {/if}
    </div>
  </div>
</div>

<style>
  .stage {
    position: fixed;
    inset: 0;
    overflow: hidden;
    background:
      radial-gradient(1200px 700px at 50% 120%, #4f9560 0%, transparent 60%),
      linear-gradient(180deg, #bfe3c6 0%, #7cc089 30%, #4c8a5c 60%, #3f7d4e 100%);
  }

  .world {
    position: absolute;
    left: 50%;
    top: 50%;
    transform-origin: center center;
  }
  .world.hidden { visibility: hidden; }

  /* ---------- loading screen ---------- */
  .loading {
    position: absolute; inset: 0; z-index: 200;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 14px; color: #fff; text-align: center;
  }
  .spinner { font-size: 64px; animation: cast 1.2s ease-in-out infinite; }
  .loading-title { font-size: 30px; font-weight: bold; letter-spacing: 1px; text-shadow: 0 3px 0 rgba(0,0,0,.18); }
  .loading-bar {
    width: 220px; max-width: 60vw; height: 12px; border-radius: 999px;
    background: rgba(255,255,255,.3); overflow: hidden;
  }
  .loading-bar span { display: block; height: 100%; background: #ffe27a; border-radius: 999px; transition: width .25s ease; }
  .loading-sub { font-size: 15px; opacity: .85; }
  @keyframes cast { 0%,100% { transform: rotate(-12deg) translateY(0); } 50% { transform: rotate(12deg) translateY(-6px); } }

  /* ---------- scenery ---------- */
  .sky {
    position: absolute; left: 0; top: 0; width: 100%; height: 46%;
    background: linear-gradient(180deg, #aee0f0 0%, #cdeede 70%, transparent 100%);
  }
  .sun {
    position: absolute; right: 90px; top: 50px;
    width: 110px; height: 110px; border-radius: 50%;
    background: radial-gradient(circle, #fff6c2 0%, #ffe27a 55%, #ffd24d 100%);
    box-shadow: 0 0 60px 20px rgba(255, 226, 122, .6);
  }
  .cloud {
    position: absolute; background: #fff; border-radius: 100px; filter: blur(.3px); opacity: .9;
    box-shadow: 40px 8px 0 -6px #fff, 90px 4px 0 -10px #fff, -34px 6px 0 -8px #fff;
  }
  .c1 { width: 90px; height: 34px; top: 70px; left: 200px; }
  .c2 { width: 70px; height: 28px; top: 130px; left: 520px; opacity: .8; }
  .c3 { width: 80px; height: 30px; top: 90px; left: 820px; opacity: .75; }

  .hill { position: absolute; border-radius: 50% 50% 0 0; background: #5aa06a; }
  .h1 { width: 900px; height: 360px; left: -100px; top: 300px; background: #58a066; }
  .h2 { width: 1000px; height: 340px; left: 500px; top: 330px; background: #4f9560; }

  .ground {
    position: absolute; left: 0; bottom: 0; width: 100%; height: 44%;
    background: linear-gradient(180deg, #5aa06a 0%, #47895a 60%, #3c7a4d 100%);
    box-shadow: inset 0 12px 24px rgba(255, 255, 255, .12);
  }
  .path {
    position: absolute; bottom: 40px; left: 60px; right: 60px; height: 120px;
    background: linear-gradient(180deg, #d8b487 0%, #c39c6b 100%);
    border-radius: 60px; opacity: .85; box-shadow: inset 0 6px 12px rgba(0, 0, 0, .12);
  }

  /* ---------- HUD & banner ---------- */
  .hud { position: absolute; top: 18px; left: 18px; display: flex; gap: 10px; z-index: 20; }
  .chip {
    background: rgba(255, 255, 255, .85); border: 2px solid rgba(255, 255, 255, .9);
    border-radius: 999px; padding: 8px 16px; font-size: 20px; box-shadow: 0 4px 10px rgba(0, 0, 0, .18);
  }
  .chip b { color: #2f7d3a; }
  .banner {
    position: absolute; top: 20px; left: 50%; transform: translateX(-50%);
    color: #fff; font-size: 40px; letter-spacing: 1px; z-index: 20;
    text-shadow: 0 3px 0 rgba(0, 0, 0, .18), 0 8px 20px rgba(0, 0, 0, .25);
  }

  /* ---------- pond ---------- */
  .pond-area { position: absolute; left: 20px; bottom: 60px; width: 460px; height: 360px; }
  .pond-img {
    width: 100%; height: 100%; object-fit: cover; border-radius: 50% / 42%;
    box-shadow: 0 18px 40px rgba(0, 0, 0, .3);
  }
  .shark {
    position: absolute; left: 46%; top: 44%; transform: translate(-50%, -50%); z-index: 6;
    cursor: default; animation: swim 6s ease-in-out infinite;
  }
  .shark img { width: 100%; display: block; filter: drop-shadow(0 6px 6px rgba(0, 0, 0, .4)); }
  .shark.armed { cursor: pointer; animation: swim 2.4s ease-in-out infinite; }
  .shark.biting img { filter: drop-shadow(0 0 14px #ffe27a) drop-shadow(0 6px 6px rgba(0,0,0,.4)); }
  .shark:not(.armed) img { opacity: .82; }
  .shark.hit { animation: shake .13s linear; }
  .ring { position: absolute; inset: -14px; border: 4px solid #ffe27a; border-radius: 50%; animation: pulse 1.1s ease-out infinite; }
  .fight-ui { position: absolute; left: 50%; top: -6px; transform: translateX(-50%); text-align: center; z-index: 9; width: 300px; }
  .fight-label {
    display: inline-block; margin-bottom: 6px; background: rgba(0, 0, 0, .6); color: #fff;
    padding: 4px 14px; border-radius: 999px; font-size: 16px; font-weight: bold;
    animation: bob 1s ease-in-out infinite; white-space: nowrap;
  }
  .fight-bar {
    height: 20px; border-radius: 999px; background: rgba(0, 0, 0, .4);
    overflow: hidden; border: 3px solid rgba(255, 255, 255, .85); box-shadow: 0 4px 10px rgba(0, 0, 0, .3);
  }
  .fight-bar span { display: block; height: 100%; border-radius: 999px; transition: width .08s linear, background .12s linear; }
  .caught-banner {
    position: absolute; left: 50%; top: 30%; transform: translateX(-50%);
    background: linear-gradient(180deg, #fff6c2, #ffd451); color: #5a3d00;
    border: 4px solid #fff; border-radius: 16px; padding: 10px 20px;
    font-size: 26px; font-weight: bold; white-space: nowrap; z-index: 30;
    box-shadow: 0 10px 24px rgba(0, 0, 0, .35); animation: caughtPop 1.4s ease-out forwards;
  }
  @keyframes caughtPop {
    0% { transform: translateX(-50%) scale(.5); opacity: 0; }
    20% { transform: translateX(-50%) scale(1.1); opacity: 1; }
    75% { transform: translateX(-50%) scale(1); opacity: 1; }
    100% { transform: translateX(-50%) translateY(-30px) scale(1); opacity: 0; }
  }
  @keyframes swim {
    0%, 100% { transform: translate(-58%, -50%) rotate(-2deg); }
    50% { transform: translate(-38%, -46%) rotate(3deg); }
  }
  @keyframes pulse { 0% { transform: scale(.85); opacity: .9; } 100% { transform: scale(1.3); opacity: 0; } }
  @keyframes bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
  @keyframes shake {
    0% { transform: translate(-50%, -50%) rotate(0); }
    25% { transform: translate(-54%, -52%) rotate(-5deg); }
    75% { transform: translate(-46%, -48%) rotate(5deg); }
    100% { transform: translate(-50%, -50%) rotate(0); }
  }

  /* ---------- fisherman ---------- */
  .fisher {
    position: absolute; bottom: 40px; height: 360px; z-index: 14;
    transition: left 1.15s ease-in-out;
    filter: drop-shadow(0 10px 14px rgba(0, 0, 0, .35));
  }
  .fisher-img { height: 100%; display: block; }
  .fisher.walking { animation: walkbob .4s ease-in-out infinite; }
  @keyframes walkbob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
  .carry {
    position: absolute; top: 40%; left: 28%; transform: rotate(-18deg);
    animation: wiggle .5s ease-in-out infinite;
  }
  .carry img { width: 100%; display: block; filter: drop-shadow(0 4px 6px rgba(0, 0, 0, .4)); }
  @keyframes wiggle { 0%,100% { transform: rotate(-18deg); } 50% { transform: rotate(-8deg); } }

  /* ---------- math post ---------- */
  .math-post { position: absolute; left: 50%; bottom: 70px; transform: translateX(-50%); width: 340px; z-index: 12; }
  .post-leg { position: absolute; bottom: -70px; width: 18px; height: 90px; background: linear-gradient(90deg, #7a5230, #9c6a3c); border-radius: 4px; }
  .post-leg.l { left: 70px; }
  .post-leg.r { right: 70px; }
  .board {
    background: linear-gradient(180deg, #fffdf5, #f3efe0); border: 8px solid #8a5a30;
    border-radius: 18px; padding: 16px 18px 14px; box-shadow: 0 16px 30px rgba(0, 0, 0, .3); text-align: center;
  }
  .board-title { font-size: 18px; color: #8a5a30; font-weight: bold; letter-spacing: 1px; text-transform: uppercase; }
  .equation { font-size: 52px; font-weight: bold; color: #24402a; margin: 6px 0 14px; }
  .entry { display: flex; gap: 8px; }
  .entry input {
    flex: 1; min-width: 0; font-size: 30px; text-align: center; padding: 8px;
    border: 3px solid #47895a; border-radius: 12px; outline: none; color: #24402a; -moz-appearance: textfield;
  }
  .entry input::-webkit-outer-spin-button, .entry input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .entry input:focus { border-color: #ffb800; }
  .entry input:disabled { background: #eee; opacity: .7; }
  .go {
    border: none; border-radius: 12px; padding: 8px 20px; font-size: 24px; font-weight: bold; cursor: pointer;
    background: linear-gradient(180deg, #ffd451, #f4c430); color: #5a3d00; box-shadow: 0 4px 0 #b8901f;
  }
  .go:active { transform: translateY(3px); box-shadow: 0 1px 0 #b8901f; }
  .go:disabled { filter: grayscale(.6); opacity: .6; cursor: default; box-shadow: 0 4px 0 #999; }
  .feedback { min-height: 22px; margin-top: 10px; font-weight: bold; font-size: 16px; color: #6a6a6a; }
  .feedback.ok { color: #2f8a3d; }
  .feedback.bad { color: #cc3b3b; }

  /* ---------- market ---------- */
  .market { position: absolute; right: 10px; bottom: 60px; width: 470px; z-index: 10; }
  .market-img { width: 100%; display: block; filter: drop-shadow(0 16px 26px rgba(0, 0, 0, .35)); }
  .market-basket { position: absolute; left: 12%; bottom: 6%; font-size: 40px; filter: drop-shadow(0 4px 6px rgba(0, 0, 0, .4)); }

  /* ---------- coin fireworks + money popup ---------- */
  .burst { position: absolute; width: 0; height: 0; z-index: 40; }
  .coin { position: absolute; font-size: 30px; animation: coinBurst 1.1s ease-out forwards; }
  @keyframes coinBurst {
    0% { transform: translate(0, 0) scale(.4); opacity: 1; }
    55% { transform: translate(var(--dx), var(--dy)) scale(1.1); opacity: 1; }
    100% { transform: translate(calc(var(--dx) * 1.15), calc(var(--dy) + 150px)) scale(.9); opacity: 0; }
  }
  .money-pop {
    position: absolute; transform: translateX(-50%); left: 0; top: -10px; white-space: nowrap;
    font-size: 40px; font-weight: bold; color: #ffe27a;
    text-shadow: 0 2px 0 #b8901f, 0 4px 10px rgba(0, 0, 0, .4);
    animation: moneyUp 1.3s ease-out forwards;
  }
  @keyframes moneyUp {
    0% { transform: translateX(-50%) translateY(10px) scale(.6); opacity: 0; }
    25% { transform: translateX(-50%) translateY(0) scale(1.1); opacity: 1; }
    100% { transform: translateX(-50%) translateY(-70px) scale(1); opacity: 0; }
  }

  @media (max-width: 640px) { .banner { font-size: 34px; } }
</style>
