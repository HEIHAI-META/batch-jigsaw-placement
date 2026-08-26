import { useEffect, useMemo, useState } from 'react';
import './star-sparkle-demo.css';

const SNAP_DURATION = 640;
const makeRect = (rows, cols) => Array.from({ length:rows * cols }, (_, index) => ({ row:Math.floor(index / cols), col:index % cols }));
const MULTI_SHAPES = {
  l: { label: 'L 型', cells: [{ row:0, col:0 }, { row:1, col:0 }, { row:1, col:1 }] },
  bar: { label: '横条', cells: [{ row:0, col:0 }, { row:0, col:1 }, { row:0, col:2 }] },
  cluster: { label: '不规则', cells: [{ row:0, col:1 }, { row:1, col:0 }, { row:1, col:1 }, { row:1, col:2 }] },
};
const COMBO_CASES = {
  basic: { label:'基础组合' },
  8: { label:'8 块', cells:makeRect(3, 3).filter(cell => !(cell.row === 0 && cell.col === 2)) },
  20: { label:'20 块', cells:makeRect(4, 5) },
  50: { label:'50 块', cells:makeRect(5, 10) },
};
const AREA_OPTIONS = [
  { value: 'outline', label: '完全外轮廓', note: '跟随拼图凸起、凹槽及组合外沿' },
  { value: 'box', label: '方形规整轮廓', note: '沿拖拽对象的外接矩形生成' },
  { value: 'circle', label: '圆形圈层', note: '以拖拽对象中心生成规则圆环' },
];
const SAMPLING_OPTIONS = [
  ['even', '均匀采样'],
  ['random', '完全随机'],
  ['min-distance', '最小间距随机'],
  ['template', '模板＋扰动'],
];
const DEFAULT_LAYERS = [
  { count: 10, distance: 14, size: 8, delay: 0 },
  { count: 14, distance: 34, size: 12, delay: 110 },
  { count: 18, distance: 54, size: 15, delay: 110 },
  { count: 22, distance: 74, size: 18, delay: 110 },
];
const DEFAULTS = {
  objectMode: 'single', comboCase:'basic', multiShape: 'l', area: 'outline', sampling: 'min-distance',
  layerCount: 2, spacing: 22, angleRandom: 12, sizeRandom: 18,
  startScale: .18, peakScale: 1.16, endScale: .28,
  startOpacity: 0, peakOpacity: 1,
  fadeIn: 100, hold: 220, fadeOut: 320, lifetime: 640,
  firstAppearance: 0, speed: 1,
};

function seeded(i, salt = 0) {
  const value = Math.sin(i * 9283.17 + salt * 117.31) * 43758.5453;
  return value - Math.floor(value);
}

function opposite(edge) { return edge === 'out' ? 'in' : edge === 'in' ? 'out' : 'flat'; }
function pieceEdges(row, col, rows = 5, cols = 5) {
  const right = col === cols - 1 ? 'flat' : (row + col) % 2 === 0 ? 'out' : 'in';
  const bottom = row === rows - 1 ? 'flat' : (row + col) % 2 === 0 ? 'in' : 'out';
  const left = col === 0 ? 'flat' : opposite((row + col - 1) % 2 === 0 ? 'out' : 'in');
  const top = row === 0 ? 'flat' : opposite((row - 1 + col) % 2 === 0 ? 'in' : 'out');
  return { top, right, bottom, left };
}
function piecePath(row, col, rows, cols) {
  const e = pieceEdges(row, col, rows, cols), bump = (edge, outward, inward) => edge === 'flat' ? '' : edge === 'out' ? outward : inward;
  return `M12 12 H40 ${bump(e.top, 'C40 5 47 2 58 2 C69 2 76 5 76 12', 'C40 19 47 22 58 22 C69 22 76 19 76 12')} H104 V40 ${bump(e.right, 'C111 40 114 47 114 58 C114 69 111 76 104 76', 'C97 40 94 47 94 58 C94 69 97 76 104 76')} V104 H76 ${bump(e.bottom, 'C76 111 69 114 58 114 C47 114 40 111 40 104', 'C76 97 69 94 58 94 C47 94 40 97 40 104')} H12 V76 ${bump(e.left, 'C5 76 2 69 2 58 C2 47 5 40 12 40', 'C19 76 22 69 22 58 C22 47 19 40 12 40')} V12 Z`;
}

function outlineForCells(cells, rows, cols) {
  const set = new Set(cells.map(cell => `${cell.row},${cell.col}`));
  return cells.flatMap(cell => {
    const { row, col } = cell, x = col * 92, y = row * 92, edges = [];
    if (!set.has(`${row - 1},${col}`)) edges.push({ x1:x, y1:y, x2:x+92, y2:y, nx:0, ny:-1, row, col, rows, cols, side:'top' });
    if (!set.has(`${row},${col + 1}`)) edges.push({ x1:x+92, y1:y, x2:x+92, y2:y+92, nx:1, ny:0, row, col, rows, cols, side:'right' });
    if (!set.has(`${row + 1},${col}`)) edges.push({ x1:x+92, y1:y+92, x2:x, y2:y+92, nx:0, ny:1, row, col, rows, cols, side:'bottom' });
    if (!set.has(`${row},${col - 1}`)) edges.push({ x1:x, y1:y+92, x2:x, y2:y, nx:-1, ny:0, row, col, rows, cols, side:'left' });
    return edges;
  });
}

function pointOnTrueOutline(edge, t, distance) {
  const type = pieceEdges(edge.row, edge.col, edge.rows, edge.cols)[edge.side];
  const tabT = (t - .3) / .4;
  const tab = type === 'flat' || tabT <= 0 || tabT >= 1 ? 0 : Math.sin(tabT * Math.PI) * 10 * (type === 'out' ? 1 : -1);
  return {
    x: edge.x1 + (edge.x2 - edge.x1) * t + edge.nx * (distance + tab),
    y: edge.y1 + (edge.y2 - edge.y1) * t + edge.ny * (distance + tab),
  };
}

function pointOnRect(bounds, position, distance) {
  const left = bounds.minCol * 92, top = bounds.minRow * 92;
  const right = (bounds.maxCol + 1) * 92, bottom = (bounds.maxRow + 1) * 92;
  const width = right - left, height = bottom - top, perimeter = 2 * (width + height);
  let p = ((position % 1) + 1) % 1 * perimeter;
  if (p < width) return { x:left + p, y:top - distance };
  p -= width;
  if (p < height) return { x:right + distance, y:top + p };
  p -= height;
  if (p < width) return { x:right - p, y:bottom + distance };
  p -= width;
  return { x:left - distance, y:bottom - p };
}

function samplePosition(index, count, method, settings, perimeter, salt) {
  const even = (index + .5) / count;
  const angularJitter = (seeded(index, salt) - .5) * 2 * settings.angleRandom / 360;
  if (method === 'random') return seeded(index, salt + 3);
  if (method === 'template') return even + angularJitter;
  if (method === 'min-distance') {
    const free = Math.max(0, 1 / count - Math.min(settings.spacing / perimeter, .95 / count));
    return even + (seeded(index, salt + 5) - .5) * free;
  }
  return even;
}

function Segment({ value, options, onChange, columns }) {
  return <div className="ss-segments" style={{ '--columns': columns || options.length }}>
    {options.map(option => {
      const item = Array.isArray(option) ? { value:option[0], label:option[1] } : option;
      return <button type="button" key={item.value} className={value === item.value ? 'active' : ''} onClick={() => onChange(item.value)}>{item.label}</button>;
    })}
  </div>;
}

function Slider({ label, help, value, min, max, step = 1, suffix = '', onChange, disabled = false }) {
  const percent = ((value - min) / (max - min)) * 100;
  return <div className={`ss-slider ${disabled ? 'disabled' : ''}`}>
    <span><b>{label}</b>{help && <small>{help}</small>}</span>
    <label className="ss-number-wrap"><input className="ss-number" aria-label={`${label}数值`} type="number" min={min} max={max} step={step} value={value} disabled={disabled} onChange={event => onChange(Math.max(min, Math.min(max, Number(event.currentTarget.value))))}/><em>{suffix.trim()}</em></label>
    <input aria-label={label} type="range" min={min} max={max} step={step} value={value} disabled={disabled} style={{ '--p':`${percent}%` }} onInput={event => onChange(Number(event.currentTarget.value))}/>
  </div>;
}

function ReadOnly({ label, value, help }) {
  return <div className="ss-readonly"><span><b>{label}</b>{help && <small>{help}</small>}</span><em>{value}</em></div>;
}

function StarSparkleDemo() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [playing, setPlaying] = useState(true);
  const [paused, setPaused] = useState(false);
  const [run, setRun] = useState(0);

  useEffect(() => {
    document.body.classList.add('star-sparkle-page');
    return () => document.body.classList.remove('star-sparkle-page');
  }, []);

  const replay = () => {
    setPlaying(false); setPaused(false); setRun(value => value + 1);
    requestAnimationFrame(() => requestAnimationFrame(() => setPlaying(true)));
  };
  const update = (key, value) => {
    setSettings(current => {
      const next = { ...current, [key]:value };
      if (key === 'lifetime') next.hold = Math.max(0, value - current.fadeIn - current.fadeOut);
      if (key === 'fadeIn' || key === 'hold' || key === 'fadeOut') next.lifetime = (key === 'fadeIn' ? value : current.fadeIn) + (key === 'hold' ? value : current.hold) + (key === 'fadeOut' ? value : current.fadeOut);
      if (key === 'peakOpacity' && value < next.startOpacity) next.startOpacity = value;
      if (key === 'startOpacity' && value > next.peakOpacity) next.peakOpacity = value;
      return next;
    });
    replay();
  };
  const updateLayer = (index, key, value) => {
    setLayers(current => current.map((layer, layerIndex) => layerIndex === index ? { ...layer, [key]:value } : layer));
    replay();
  };
  const setGap = value => {
    setLayers(current => current.map((layer, index) => index === 0 ? layer : { ...layer, distance:current[0].distance + value * index }));
    replay();
  };
  const reset = () => { setSettings(DEFAULTS); setLayers(DEFAULT_LAYERS); setRun(value => value + 1); setPlaying(true); setPaused(false); };

  const selectedCombo = COMBO_CASES[settings.comboCase];
  const sourceCells = settings.objectMode === 'single' ? [{ row:0, col:0 }] : settings.comboCase === 'basic' ? MULTI_SHAPES[settings.multiShape].cells : selectedCombo.cells;
  const sourceRows = sourceCells.map(cell => cell.row), sourceCols = sourceCells.map(cell => cell.col);
  const sourceMinRow = Math.min(...sourceRows), sourceMinCol = Math.min(...sourceCols);
  const cells = sourceCells.map(cell => ({ row:cell.row - sourceMinRow, col:cell.col - sourceMinCol }));
  const rows = cells.map(cell => cell.row), cols = cells.map(cell => cell.col);
  const bounds = { minRow:0, maxRow:Math.max(...rows), minCol:0, maxCol:Math.max(...cols) };
  const center = { x:(bounds.minCol + bounds.maxCol + 1) * 46, y:(bounds.minRow + bounds.maxRow + 1) * 46 };
  const width = (bounds.maxCol - bounds.minCol + 1) * 92, height = (bounds.maxRow - bounds.minRow + 1) * 92;
  const gridRows = bounds.maxRow + 1, gridCols = bounds.maxCol + 1;
  const sceneScale = Math.min(1, 350 / width, 320 / height);
  const backgroundSize = Math.max(width, height);
  const outline = outlineForCells(cells, gridRows, gridCols);
  const objectLabel = settings.objectMode === 'single' ? '单个拖拽块' : settings.comboCase === 'basic' ? `多块拖拽组合 · ${MULTI_SHAPES[settings.multiShape].label}` : `${selectedCombo.label}拖拽组合`;
  const totalCount = layers.slice(0, settings.layerCount).reduce((sum, layer) => sum + layer.count, 0);
  const secondGap = layers[1].distance - layers[0].distance;

  const particles = useMemo(() => {
    const activeLayers = layers.slice(0, settings.layerCount);
    let cumulativeDelay = 0, particleIndex = 0;
    return activeLayers.flatMap((layer, layerIndex) => {
      if (layerIndex > 0) cumulativeDelay += layer.delay;
      const layerDelay = cumulativeDelay;
      return Array.from({ length:layer.count }, (_, index) => {
        const modelDistance = layer.distance / sceneScale;
        const perimeter = settings.area === 'box' ? 2 * (width + height) : settings.area === 'circle' ? Math.PI * 2 * (Math.max(width, height) / 2 + modelDistance) : outline.length * 92;
        const position = samplePosition(index, layer.count, settings.sampling, { ...settings, spacing:settings.spacing / sceneScale }, perimeter, 20 + layerIndex * 11);
        let point;
        if (settings.area === 'circle') {
          const angle = position * Math.PI * 2 - Math.PI / 2;
          const radius = Math.max(width, height) / 2 + modelDistance;
          point = { x:center.x + Math.cos(angle) * radius, y:center.y + Math.sin(angle) * radius };
        } else if (settings.area === 'box') point = pointOnRect(bounds, position, modelDistance);
        else {
          const wrapped = ((position % 1) + 1) % 1 * outline.length;
          const edgeIndex = Math.min(outline.length - 1, Math.floor(wrapped));
          point = pointOnTrueOutline(outline[edgeIndex], wrapped - edgeIndex, modelDistance);
        }
        const randomSize = 1 + (seeded(particleIndex, 41) - .5) * 2 * settings.sizeRandom / 100;
        const result = { ...point, layer:layerIndex, size:Math.max(2, layer.size * randomSize) / sceneScale, rotation:(seeded(particleIndex, 55) - .5) * 90, delay:settings.firstAppearance + layerDelay };
        particleIndex += 1;
        return result;
      });
    });
  }, [settings, layers, settings.layerCount, width, height, center.x, center.y, sceneScale, outline.length, bounds.minCol, bounds.maxCol, bounds.minRow, bounds.maxRow]);

  const selectedArea = AREA_OPTIONS.find(option => option.value === settings.area);
  const durationScale = 1 / settings.speed;
  const fadeOutStart = settings.fadeIn + settings.hold;

  return <main className={`star-studio ${paused ? 'is-paused' : ''}`}>
    <header className="ss-header">
      <div className="ss-brand"><span>✦</span></div>
      <div><p className="ss-kicker">JIGSAW FX LAB</p><h1>星芒效果实验台</h1></div>
      <div className="ss-status"><i/> 参数实时生效 <span>{totalCount} 个星芒</span></div>
    </header>

    <section className="ss-workspace">
      <div className="ss-preview-card">
        <div className="ss-preview-head">
          <div><span>实时预览</span><h2>{objectLabel}</h2><p>{selectedArea.note}</p></div>
          <div className="ss-preview-tags"><em>{settings.layerCount} 圈</em><em>{settings.sampling === 'min-distance' ? '最小间距随机' : SAMPLING_OPTIONS.find(item => item[0] === settings.sampling)?.[1]}</em></div>
        </div>
        <div className="ss-stage">
          <div className="ss-axis ss-axis-x"/><div className="ss-axis ss-axis-y"/>
          <div className="ss-board" key={`${run}-${settings.objectMode}-${settings.comboCase}-${settings.multiShape}-${playing}`} style={{ '--snap-duration':`${SNAP_DURATION * durationScale}ms` }}>
            <div className="ss-scene" style={{ width, height, '--scene-scale':sceneScale, '--move-x':`${142 / sceneScale}px`, '--move-y':`${68 / sceneScale}px` }}>
              <div className="ss-target"/>
              {cells.map(cell => {
                const { row, col } = cell;
                return <div key={`${row}-${col}`} className={`ss-piece ${playing ? 'settling' : ''}`} style={{ '--row':row, '--col':col, clipPath:`path('${piecePath(row, col, gridRows, gridCols)}')` }}><div style={{ '--bg-size':`${backgroundSize}px`, '--bg-x':`${12-col*92+(width-backgroundSize)/2}px`, '--bg-y':`${12-row*92+(height-backgroundSize)/2}px` }}/></div>;
              })}
              {playing && <div className="ss-particles" aria-hidden="true">{particles.map((particle, index) => {
                const delay = (SNAP_DURATION + particle.delay) * durationScale;
                return <i className="ss-spark" key={`${run}-${index}`} data-layer={particle.layer + 1} style={{ left:particle.x, top:particle.y, width:particle.size, height:particle.size, transform:`translate(-50%,-50%) rotate(${particle.rotation}deg)`, '--delay':`${delay}ms`, '--fade-in':`${settings.fadeIn * durationScale}ms`, '--fade-out':`${settings.fadeOut * durationScale}ms`, '--fade-out-delay':`${(delay + fadeOutStart * durationScale)}ms`, '--start-opacity':settings.startOpacity, '--peak-opacity':settings.peakOpacity, '--start-scale':settings.startScale, '--peak-scale':settings.peakScale, '--exit-scale':settings.peakScale === 0 ? 0 : settings.endScale / settings.peakScale }}><span className="ss-spark-enter"><span className="ss-spark-exit"><b/></span></span></i>;
              })}</div>}
            </div>
          </div>
          <div className="ss-timeline"><span>拖拽对象归位</span><i/><b>0 ms</b><i/><span>第一圈出现</span><i/><span>逐圈延迟</span></div>
        </div>
        <div className="ss-playback">
          <button className="primary" onClick={() => { setPlaying(true); setPaused(false); setRun(value => value + 1); }}><i className="ss-play-icon"/>播放</button>
          <button onClick={replay}><span>↻</span>重播</button>
          <button onClick={() => setPaused(value => !value)}><i className={paused ? 'ss-play-icon' : 'ss-pause-icon'}/>{paused ? '继续' : '暂停'}</button>
          <button onClick={reset}>重置参数</button>
          <div className="ss-speed"><span>速度</span>{[.5, 1, 2].map(speed => <button key={speed} className={settings.speed === speed ? 'active' : ''} onClick={() => update('speed', speed)}>{speed}×</button>)}</div>
        </div>
      </div>

      <aside className="ss-controls">
        <div className="ss-autoplay">调节任意参数后自动从头重播</div>
        <details className="ss-panel" open>
          <summary><span>01</span><div><b>对象与生成区域</b><small>确定星芒围绕谁、沿什么轮廓生成</small></div></summary>
          <div className="ss-panel-body">
            <div className="ss-field"><span>触发对象</span><Segment value={settings.objectMode} options={[["single","单个拖拽块"],["multi","多块拖拽组合"]]} onChange={value => update('objectMode', value)}/></div>
            {settings.objectMode === 'multi' && <div className="ss-field"><span>组合规模</span><Segment value={settings.comboCase} options={Object.entries(COMBO_CASES).map(([value, item]) => [value, item.label])} onChange={value => update('comboCase', value)}/></div>}
            {settings.objectMode === 'multi' && settings.comboCase === 'basic' && <div className="ss-field"><span>组合形状</span><Segment value={settings.multiShape} options={Object.entries(MULTI_SHAPES).map(([value, item]) => [value, item.label])} onChange={value => update('multiShape', value)}/></div>}
            <div className="ss-field"><span>生成区域</span><Segment value={settings.area} options={AREA_OPTIONS} onChange={value => update('area', value)}/><p>{selectedArea.note}</p></div>
          </div>
        </details>

        <details className="ss-panel" open>
          <summary><span>02</span><div><b>边缘位置与采样</b><small>固定覆盖全部边缘，并始终向外偏移</small></div></summary>
          <div className="ss-panel-body">
            {settings.area !== 'circle' ? <Slider label="边缘偏移距离" help="第一圈星芒中心点到拖拽对象边缘的距离" value={layers[0].distance} min={0} max={80} suffix=" px" onChange={value => updateLayer(0, 'distance', value)}/> : <ReadOnly label="边缘偏移距离" value="由第一圈距离控制" help="圆形圈层不使用单独的边缘基准"/>}
            <ReadOnly label="偏移方向" value="边缘外侧" help="星芒始终位于拖拽对象外侧"/>
            <ReadOnly label="分布范围" value="全部边缘" help="固定覆盖完整轮廓或整个圆周"/>
            <div className="ss-field"><span>边缘采样方式</span><Segment value={settings.sampling} options={SAMPLING_OPTIONS} columns={2} onChange={value => update('sampling', value)}/></div>
            <Slider label="星芒排列间距" help={settings.sampling === 'min-distance' ? '随机采样时保证星芒之间不过度靠近' : '切换为最小间距随机时生效'} value={settings.spacing} min={4} max={60} suffix=" px" disabled={settings.sampling !== 'min-distance'} onChange={value => update('spacing', value)}/>
            <Slider label="角度随机范围" help="控制星芒沿轮廓位置的随机偏移" value={settings.angleRandom} min={0} max={45} suffix="°" onChange={value => update('angleRandom', value)}/>
          </div>
        </details>

        <details className="ss-panel" open>
          <summary><span>03</span><div><b>圈层、数量与距离</b><small>启用 1–4 圈，并独立控制每一圈</small></div></summary>
          <div className="ss-panel-body">
            <div className="ss-field"><span>圈层数量</span><Segment value={settings.layerCount} options={[1,2,3,4].map(value => ({ value, label:`${value} 圈` }))} onChange={value => update('layerCount', value)}/></div>
            <ReadOnly label="星芒总数量" value={`${totalCount} 个`} help="自动等于所有启用圈层数量之和"/>
            {settings.layerCount > 1 && <Slider label="两圈间距" help="调整后将按统一间距重新排列所有外圈" value={secondGap} min={4} max={60} suffix=" px" onChange={setGap}/>} 
            <div className="ss-layer-list">{layers.slice(0, settings.layerCount).map((layer, index) => <section className="ss-layer-card" key={index}>
              <div className="ss-layer-title"><span>{index + 1}</span><b>第{index + 1}圈</b><em>{layer.count} 个 · {layer.distance}px</em></div>
              <Slider label={`第${index + 1}圈数量`} value={layer.count} min={2} max={36} suffix=" 个" onChange={value => updateLayer(index, 'count', value)}/>
              {index === 0 && settings.area !== 'circle' ? <ReadOnly label="第一圈距离" value={`${layer.distance} px`} help="与上方边缘偏移距离同步"/> : <Slider label={`第${index + 1}圈距离`} value={layer.distance} min={0} max={140} suffix=" px" onChange={value => updateLayer(index, 'distance', value)}/>} 
              <Slider label={`第${index + 1}圈星芒尺寸`} value={layer.size} min={2} max={30} suffix=" px" onChange={value => updateLayer(index, 'size', value)}/>
              {index > 0 && <Slider label={`第${index + 1}圈出现延迟`} help="相对于前一圈开始出现的时间" value={layer.delay} min={0} max={500} step={10} suffix=" ms" onChange={value => updateLayer(index, 'delay', value)}/>} 
            </section>)}</div>
            <Slider label="尺寸随机范围" help="每颗星芒围绕所属圈层尺寸上下浮动" value={settings.sizeRandom} min={0} max={60} suffix="%" onChange={value => update('sizeRandom', value)}/>
          </div>
        </details>

        <details className="ss-panel" open>
          <summary><span>04</span><div><b>透明度与缩放</b><small>控制单颗星芒出现、峰值与退出状态</small></div></summary>
          <div className="ss-panel-body ss-two-column">
            <Slider label="初始透明度" value={settings.startOpacity} min={0} max={1} step={.05} onChange={value => update('startOpacity', value)}/>
            <Slider label="峰值透明度" value={settings.peakOpacity} min={0} max={1} step={.05} onChange={value => update('peakOpacity', value)}/>
            <Slider label="初始缩放" value={settings.startScale} min={0} max={1} step={.05} suffix="×" onChange={value => update('startScale', value)}/>
            <Slider label="峰值缩放" value={settings.peakScale} min={.2} max={2} step={.05} suffix="×" onChange={value => update('peakScale', value)}/>
            <Slider label="结束缩放" value={settings.endScale} min={0} max={1.5} step={.05} suffix="×" onChange={value => update('endScale', value)}/>
          </div>
        </details>

        <details className="ss-panel" open>
          <summary><span>05</span><div><b>出现节奏与生命周期</b><small>以拼图归位完成时刻作为 0 ms</small></div></summary>
          <div className="ss-panel-body">
            <Slider label="第一圈出现时间" help="从拼图归位完成到第一圈开始出现" value={settings.firstAppearance} min={0} max={1000} step={10} suffix=" ms" onChange={value => update('firstAppearance', value)}/>
            <Slider label="淡入时间" value={settings.fadeIn} min={20} max={600} step={10} suffix=" ms" onChange={value => update('fadeIn', value)}/>
            <Slider label="停留时间" value={settings.hold} min={0} max={1000} step={10} suffix=" ms" onChange={value => update('hold', value)}/>
            <Slider label="淡出时间" value={settings.fadeOut} min={20} max={1000} step={10} suffix=" ms" onChange={value => update('fadeOut', value)}/>
            <Slider label="单次效果总时长" help="单颗星芒从出现到完全消失；调整时自动重算停留时间" value={settings.lifetime} min={settings.fadeIn + settings.fadeOut} max={2400} step={10} suffix=" ms" onChange={value => update('lifetime', value)}/>
            <div className="ss-duration-equation"><span>{settings.fadeIn} ms 淡入</span><i>＋</i><span>{settings.hold} ms 停留</span><i>＋</i><span>{settings.fadeOut} ms 淡出</span><b>＝ {settings.lifetime} ms</b></div>
          </div>
        </details>
      </aside>
    </section>
  </main>;
}

export { StarSparkleDemo };
