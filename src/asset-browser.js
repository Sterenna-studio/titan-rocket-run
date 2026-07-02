import { withAssetCacheBust } from './game/cacheBust.ts';

(() => {
  const $ = (id) => document.getElementById(id);
  const els = {
    filter: $('animationFilter'), search: $('searchInput'), zoom: $('zoomRange'),
    play: $('playAllBtn'), summary: $('summary'), grid: $('assetGrid'),
    gridCount: $('gridCount'), previewImage: $('previewImage'), previewMeta: $('previewMeta')
  };

  let manifest = null;
  let frames = [];
  let visible = [];
  let selected = null;
  let timer = null;
  let playIndex = 0;

  const labels = {
    idle: 'Idle / attente', walk: 'Marche', run: 'Course', jump: 'Saut',
    attack_combo: 'Attaque combo', bark_energy_blast: 'Bark energy blast',
    hurt: 'Degat', knockout: 'K.O.', sit_rest: 'Repos'
  };

  async function init() {
    try {
      const res = await fetch(withAssetCacheBust('assets/titan_manifest.json'));
      manifest = await res.json();
      makeFrameList();
      makeFilters();
      makeSummary();
      bind();
      renderGrid();
      selectFrame(visible[0]);
    } catch (err) {
      els.grid.textContent = 'Impossible de charger assets/titan_manifest.json : ' + err.message;
    }
  }

  function makeFrameList() {
    frames = [];
    Object.keys(manifest.animations).forEach((animName) => {
      const anim = manifest.animations[animName];
      anim.frames.forEach((src, index) => frames.push({
        animName, src, index, fps: anim.fps, loop: anim.loop,
        label: labels[animName] || animName,
        name: animName + '_' + String(index + 1).padStart(2, '0')
      }));
    });
  }

  function makeFilters() {
    Object.keys(manifest.animations).forEach((animName) => {
      const option = document.createElement('option');
      option.value = animName;
      option.textContent = (labels[animName] || animName) + ' (' + manifest.animations[animName].frames.length + ')';
      els.filter.appendChild(option);
    });
  }

  function makeSummary() {
    const stats = [
      ['Animations', Object.keys(manifest.animations).length],
      ['Frames PNG', frames.length],
      ['Animations en boucle', Object.values(manifest.animations).filter((a) => a.loop).length],
      ['Personnage', manifest.character || 'Titan']
    ];
    els.summary.replaceChildren(...stats.map(([label, value]) => {
      const card = document.createElement('article');
      card.className = 'summaryCard';
      const b = document.createElement('b');
      const span = document.createElement('span');
      b.textContent = value;
      span.textContent = label;
      card.append(b, span);
      return card;
    }));
  }

  function bind() {
    els.filter.addEventListener('change', renderGrid);
    els.search.addEventListener('input', renderGrid);
    els.zoom.addEventListener('input', () => document.documentElement.style.setProperty('--cardSize', els.zoom.value + 'px'));
    els.play.addEventListener('click', togglePlayback);
    document.documentElement.style.setProperty('--cardSize', els.zoom.value + 'px');
  }

  function renderGrid() {
    stopPlayback();
    const selectedAnim = els.filter.value;
    const query = els.search.value.trim().toLowerCase();
    visible = frames.filter((frame) => {
      const byAnim = selectedAnim === 'all' || frame.animName === selectedAnim;
      const text = (frame.animName + ' ' + frame.label + ' ' + frame.name + ' ' + frame.src).toLowerCase();
      return byAnim && (!query || text.includes(query));
    });
    els.gridCount.textContent = visible.length + ' frame' + (visible.length > 1 ? 's' : '');
    els.grid.replaceChildren(...visible.map(makeCard));
  }

  function makeCard(frame) {
    const card = document.createElement('article');
    card.className = 'assetCard';
    card.dataset.src = frame.src;
    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    const img = document.createElement('img');
    img.src = withAssetCacheBust(frame.src);
    img.alt = frame.name;
    img.loading = 'lazy';
    thumb.appendChild(img);
    const info = document.createElement('div');
    info.className = 'assetInfo';
    const title = document.createElement('b');
    title.textContent = frame.name;
    const path = document.createElement('small');
    path.textContent = frame.src;
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = frame.label;
    info.append(title, path, badge);
    card.append(thumb, info);
    card.addEventListener('click', () => selectFrame(frame));
    return card;
  }

  function selectFrame(frame) {
    if (!frame) return;
    selected = frame;
    els.previewImage.src = withAssetCacheBust(frame.src);
    els.previewImage.alt = frame.name;
    els.previewMeta.replaceChildren(
      line(frame.name, true), line('Animation : ' + frame.label),
      line('Frame : ' + (frame.index + 1) + '/' + manifest.animations[frame.animName].frames.length),
      line('FPS suggere : ' + frame.fps), line('Loop : ' + (frame.loop ? 'oui' : 'non')),
      line('Chemin : ' + frame.src)
    );
    document.querySelectorAll('.assetCard').forEach((card) => card.classList.toggle('active', card.dataset.src === frame.src));
  }

  function line(text, strong = false) {
    const div = document.createElement(strong ? 'b' : 'div');
    div.textContent = text;
    return div;
  }

  function togglePlayback() {
    if (timer) return stopPlayback();
    let animName = selected ? selected.animName : els.filter.value;
    if (animName === 'all') animName = 'idle';
    const list = frames.filter((frame) => frame.animName === animName);
    if (!list.length) return;
    playIndex = Math.max(0, list.findIndex((frame) => selected && frame.src === selected.src));
    els.play.textContent = 'Pause';
    const fps = manifest.animations[animName].fps || 8;
    timer = setInterval(() => {
      selectFrame(list[playIndex]);
      playIndex = (playIndex + 1) % list.length;
    }, 1000 / fps);
  }

  function stopPlayback() {
    els.play.textContent = "Lire l'animation";
    if (timer) clearInterval(timer);
    timer = null;
  }

  init();
})();
