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

  // ---- game state ----
  let money = 0;
  let caught = 0;
  let streak = 0;

  let a = 2, b = 2, op = '+', answer = 4;
  let input = '';
  let feedback = '';
  let feedbackKind = ''; // 'ok' | 'bad'

  let armed = false;      // can we catch a fish right now?
  let biting = false;     // shark is highlighted / on the line
  let inputEl;

  // flying fish animation state
  let flyer = null; // {x1,y1,x2,y2,value}

  function rnd(n) { return Math.floor(Math.random() * n); }

  function newProblem() {
    const ops = ['+', '-', '×'];
    op = ops[rnd(ops.length)];
    if (op === '+') { a = rnd(12) + 1; b = rnd(12) + 1; answer = a + b; }
    else if (op === '-') { a = rnd(12) + 6; b = rnd(a); answer = a - b; }
    else { a = rnd(8) + 2; b = rnd(8) + 2; answer = a * b; }
    input = '';
  }

  function submit() {
    if (armed) { flash('Catch your fish first! 🎣', 'ok'); return; }
    // `input` can be a number (type="number" binding) or empty string
    const raw = String(input ?? '').trim();
    if (raw === '') { flash('Type an answer!', 'bad'); return; }
    if (parseInt(raw, 10) === answer) {
      streak += 1;
      flash('Correct! Reel one in! 🎣', 'ok');
      armed = true;
      biting = true;
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

  const sharkEl = () => document.querySelector('.shark');
  const marketEl = () => document.querySelector('.market-basket');

  async function catchFish() {
    if (!armed) { flash('Solve the math first! 🧮', 'bad'); return; }
    armed = false;
    biting = false;
    caught += 1;
    const value = 5 + rnd(12) + streak * 2;

    // fly the fish from the pond to the market
    const s = sharkEl().getBoundingClientRect();
    const m = marketEl().getBoundingClientRect();
    flyer = {
      x1: s.left + s.width / 2,
      y1: s.top + s.height / 2,
      x2: m.left + m.width / 2,
      y2: m.top + m.height / 2,
      value,
    };
    await tick();
    // trigger transition on next frame
    requestAnimationFrame(() => {
      const el = document.querySelector('.flyer');
      if (el) {
        el.style.left = flyer.x2 + 'px';
        el.style.top = flyer.y2 + 'px';
        el.style.transform = 'translate(-50%,-50%) scale(.35) rotate(400deg)';
        el.style.opacity = '0.2';
      }
    });

    setTimeout(() => {
      money += value;
      flash(`Sold at Restaurant Kayan for $${value}! 💰`, 'ok');
      flyer = null;
      newProblem();
      focusInput();
    }, 850);
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
            img.onerror = done; // never block on a broken asset
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
      <div
        class="shark {armed ? 'armed' : ''} {biting ? 'biting' : ''}"
        on:click={catchFish}
        on:keydown={(e) => e.key === 'Enter' && catchFish()}
        role="button"
        tabindex="0"
        aria-label="Catch the fish"
      >
        <img src="{BASE}assets/shark.png" alt="Fish" />
        {#if armed}<div class="ring"></div>{/if}
      </div>
      {#if armed}<div class="tap-hint">tap the fish!</div>{/if}
    </div>
    <img class="fisherman" src="{BASE}assets/fisherman.png" alt="Fisherman" />

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
          />
          <button class="go" on:click={submit}>Cast</button>
        </div>
        <div class="feedback {feedbackKind}">{feedback || ' '}</div>
      </div>
    </div>

    <!-- RIGHT: the market / restaurant -->
    <div class="market">
      <img class="market-img" src="{BASE}assets/fish-marked.png" alt="Restaurant Kayan" />
      <div class="market-basket">🧺</div>
    </div>

  </div>

  {#if flyer}
    <div
      class="flyer"
      style="left:{flyer.x1}px;top:{flyer.y1}px;"
    >
      <img src="{BASE}assets/shark.png" alt="" />
    </div>
  {/if}
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
  .spinner {
    font-size: 64px;
    animation: cast 1.2s ease-in-out infinite;
  }
  .loading-title {
    font-size: 30px; font-weight: bold; letter-spacing: 1px;
    text-shadow: 0 3px 0 rgba(0, 0, 0, .18);
  }
  .loading-bar {
    width: 220px; max-width: 60vw; height: 12px; border-radius: 999px;
    background: rgba(255, 255, 255, .3); overflow: hidden;
  }
  .loading-bar span {
    display: block; height: 100%; background: #ffe27a; border-radius: 999px;
    transition: width .25s ease;
  }
  .loading-sub { font-size: 15px; opacity: .85; }
  @keyframes cast {
    0%, 100% { transform: rotate(-12deg) translateY(0); }
    50% { transform: rotate(12deg) translateY(-6px); }
  }

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
    position: absolute; background: #fff; border-radius: 100px;
    filter: blur(.3px); opacity: .9;
    box-shadow: 40px 8px 0 -6px #fff, 90px 4px 0 -10px #fff, -34px 6px 0 -8px #fff;
  }
  .c1 { width: 90px; height: 34px; top: 70px; left: 200px; }
  .c2 { width: 70px; height: 28px; top: 130px; left: 520px; opacity: .8; }
  .c3 { width: 80px; height: 30px; top: 90px; left: 820px; opacity: .75; }

  .hill {
    position: absolute; border-radius: 50% 50% 0 0;
    background: #5aa06a;
  }
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
    border-radius: 60px;
    opacity: .85;
    box-shadow: inset 0 6px 12px rgba(0, 0, 0, .12);
  }

  /* ---------- HUD & banner ---------- */
  .hud {
    position: absolute; top: 18px; left: 18px; display: flex; gap: 10px; z-index: 20;
  }
  .chip {
    background: rgba(255, 255, 255, .85);
    border: 2px solid rgba(255, 255, 255, .9);
    border-radius: 999px; padding: 8px 16px; font-size: 20px;
    box-shadow: 0 4px 10px rgba(0, 0, 0, .18);
  }
  .chip b { color: #2f7d3a; }
  .banner {
    position: absolute; top: 20px; left: 50%; transform: translateX(-50%);
    color: #fff; font-size: 40px; letter-spacing: 1px; z-index: 20;
    text-shadow: 0 3px 0 rgba(0, 0, 0, .18), 0 8px 20px rgba(0, 0, 0, .25);
  }

  /* ---------- pond ---------- */
  .pond-area {
    position: absolute; left: 20px; bottom: 60px; width: 460px; height: 360px;
  }
  .pond-img {
    width: 100%; height: 100%; object-fit: cover;
    border-radius: 50% / 42%;
    box-shadow: 0 18px 40px rgba(0, 0, 0, .3);
  }
  .shark {
    position: absolute; left: 46%; top: 44%;
    width: 150px; transform: translate(-50%, -50%);
    cursor: default; z-index: 6;
    animation: swim 6s ease-in-out infinite;
  }
  .shark img { width: 100%; display: block; filter: drop-shadow(0 6px 6px rgba(0, 0, 0, .4)); }
  .shark.armed { cursor: pointer; animation: swim 2.4s ease-in-out infinite; }
  .shark.biting img { filter: drop-shadow(0 0 14px #ffe27a) drop-shadow(0 6px 6px rgba(0,0,0,.4)); }
  .shark:not(.armed) img { opacity: .82; }
  .ring {
    position: absolute; inset: -14px; border: 4px solid #ffe27a; border-radius: 50%;
    animation: pulse 1.1s ease-out infinite;
  }
  .tap-hint {
    position: absolute; left: 46%; top: 8%; transform: translateX(-50%);
    background: rgba(0, 0, 0, .55); color: #fff; padding: 4px 12px;
    border-radius: 999px; font-size: 16px; z-index: 7; white-space: nowrap;
    animation: bob 1s ease-in-out infinite;
  }
  @keyframes swim {
    0%, 100% { transform: translate(-58%, -50%) rotate(-2deg); }
    50% { transform: translate(-38%, -46%) rotate(3deg); }
  }
  @keyframes pulse {
    0% { transform: scale(.85); opacity: .9; }
    100% { transform: scale(1.3); opacity: 0; }
  }
  @keyframes bob {
    0%, 100% { transform: translateX(-50%) translateY(0); }
    50% { transform: translateX(-50%) translateY(-4px); }
  }

  .fisherman {
    position: absolute; left: 400px; bottom: 40px; height: 400px; z-index: 8;
    filter: drop-shadow(0 10px 14px rgba(0, 0, 0, .35));
  }

  /* ---------- math post ---------- */
  .math-post {
    position: absolute; left: 50%; bottom: 70px; transform: translateX(-50%);
    width: 340px; z-index: 12;
  }
  .post-leg {
    position: absolute; bottom: -70px; width: 18px; height: 90px;
    background: linear-gradient(90deg, #7a5230, #9c6a3c);
    border-radius: 4px;
  }
  .post-leg.l { left: 70px; }
  .post-leg.r { right: 70px; }
  .board {
    background: linear-gradient(180deg, #fffdf5, #f3efe0);
    border: 8px solid #8a5a30;
    border-radius: 18px;
    padding: 16px 18px 14px;
    box-shadow: 0 16px 30px rgba(0, 0, 0, .3);
    text-align: center;
  }
  .board-title {
    font-size: 18px; color: #8a5a30; font-weight: bold; letter-spacing: 1px;
    text-transform: uppercase;
  }
  .equation {
    font-size: 52px; font-weight: bold; color: #24402a; margin: 6px 0 14px;
  }
  .entry { display: flex; gap: 8px; }
  .entry input {
    flex: 1; min-width: 0; font-size: 30px; text-align: center;
    padding: 8px; border: 3px solid #47895a; border-radius: 12px;
    outline: none; color: #24402a; -moz-appearance: textfield;
  }
  .entry input::-webkit-outer-spin-button,
  .entry input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .entry input:focus { border-color: #ffb800; }
  .go {
    border: none; border-radius: 12px; padding: 8px 20px;
    font-size: 24px; font-weight: bold; cursor: pointer;
    background: linear-gradient(180deg, #ffd451, #f4c430); color: #5a3d00;
    box-shadow: 0 4px 0 #b8901f;
  }
  .go:active { transform: translateY(3px); box-shadow: 0 1px 0 #b8901f; }
  .feedback {
    min-height: 22px; margin-top: 10px; font-weight: bold; font-size: 16px;
    color: #6a6a6a;
  }
  .feedback.ok { color: #2f8a3d; }
  .feedback.bad { color: #cc3b3b; }

  /* ---------- market ---------- */
  .market {
    position: absolute; right: 10px; bottom: 60px; width: 470px; z-index: 10;
  }
  .market-img {
    width: 100%; display: block;
    filter: drop-shadow(0 16px 26px rgba(0, 0, 0, .35));
  }
  .market-basket {
    position: absolute; left: 12%; bottom: 6%; font-size: 40px;
    filter: drop-shadow(0 4px 6px rgba(0, 0, 0, .4));
  }

  /* ---------- flying fish ---------- */
  .flyer {
    position: fixed; z-index: 100; width: 120px;
    transform: translate(-50%, -50%) scale(1) rotate(0deg);
    transition: left .85s cubic-bezier(.4, -0.2, .5, 1),
                top .85s cubic-bezier(.5, .1, .5, 1),
                transform .85s ease-in, opacity .85s ease-in;
    pointer-events: none;
  }
  .flyer img { width: 100%; filter: drop-shadow(0 6px 8px rgba(0, 0, 0, .4)); }

  @media (max-width: 640px) {
    .banner { font-size: 34px; }
  }
</style>
