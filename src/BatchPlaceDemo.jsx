import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import './batch-place-demo.css';
import {
  CARRY_STACK_OFFSET_X,
  CARRY_STACK_OFFSET_Y,
  carryStackFullyAboveBoundary,
  visibleCarryPieceIds,
} from './carry-stack-geometry.js';
import {
  HOLD_DELAY,
  PICKER_CLOSE_ANIMATION_DURATION,
  holdShouldCancel,
  pointInsideRect,
} from './pickup-gesture.js';
import { batchFullyInsideRect, buildBatchLayout } from './batch-placement-layout.js';

const PIECES = Array.from({ length: 25 }, (_, index) => ({
  id: index + 1,
  row: Math.floor(index / 5),
  col: index % 5,
}));

const INITIAL_SELECTION = [];
const UNDO_DURATION = 10000;
const GUIDE_STORAGE_KEY = 'batch-jigsaw-guide-completed';
const GUIDE_COPY = {
  selectFirst: '点击选择需要放置的碎片',
  selectMore: '一次放置中，你可以选择多个碎片',
  hold: '长按任意一张已选中的碎片',
  drag: '向上拖动，放置到操作台',
};
const INITIAL_BOARD_PIECES = [
  { pieceId: 16, x: 72, y: 174, rotate: -7 },
  { pieceId: 17, x: 164, y: 220, rotate: 4 },
  { pieceId: 19, x: 260, y: 150, rotate: 9 },
];

const PIECE_PATH = "M8 8 H21 C21 2 26 0 31 0 C36 0 41 2 41 8 H54 V21 C60 21 62 26 62 31 C62 36 60 41 54 41 V54 H41 C41 60 36 62 31 62 C26 62 21 60 21 54 H8 V41 C2 41 0 36 0 31 C0 26 2 21 8 21 Z";

function PuzzlePiece({ piece, className = '', style, onClick, onPointerDown, selected = false, disabled = false, label }) {
  const Element = onClick || onPointerDown ? 'button' : 'div';

  return (
    <Element
      {...(Element === 'button' ? { type: 'button', 'aria-pressed': selected, disabled } : {})}
      className={`mobile-piece ${selected ? 'selected' : ''} ${disabled ? 'selection-locked' : ''} ${className}`}
      style={{
        '--image-x': `${-piece.col * 62}px`,
        '--image-y': `${-piece.row * 62}px`,
        '--image-x-small': `${-piece.col * 50}px`,
        '--image-y-small': `${-piece.row * 50}px`,
        clipPath: `path('${PIECE_PATH}')`,
        ...style,
      }}
      onClick={onClick}
      onPointerDown={onPointerDown}
      data-piece-id={piece.id}
      aria-label={label || `碎片 ${piece.id}`}
    >
      <span />
      {selected && <i>✓</i>}
    </Element>
  );
}

function BatchPlaceDemo() {
  const phoneRef = useRef(null);
  const playSpaceRef = useRef(null);
  const boardRef = useRef(null);
  const pickerRef = useRef(null);
  const holdTimerRef = useRef(null);
  const holdPieceIdRef = useRef(null);
  const pickerCloseAnimationTimerRef = useRef(null);
  const guideCycleTimerRef = useRef(null);
  const guideCopyTimerRef = useRef(null);
  const guideHoldDelayTimerRef = useRef(null);
  const pickerClosingRef = useRef(false);
  const draggingRef = useRef(false);
  const pointerIdRef = useRef(null);
  const gestureSourceRef = useRef(null);
  const leftPickerRef = useRef(false);
  const holdStartRef = useRef({ x: 0, y: 0 });
  const holdTargetRef = useRef(null);
  const holdCancelledRef = useRef(false);
  const lastPointerRef = useRef({ clientX: 0, clientY: 0 });
  const selectedIdsRef = useRef(INITIAL_SELECTION);
  const suppressClickRef = useRef(false);
  const originRef = useRef({ x: 96, y: 292 });
  const cursorRef = useRef({ x: 196, y: 292 });
  const insideBoardRef = useRef(false);
  const [view, setView] = useState('board');
  const [pieceOrder, setPieceOrder] = useState(PIECES.map((piece) => piece.id));
  const [selectedIds, setSelectedIds] = useState(INITIAL_SELECTION);
  const [dragging, setDragging] = useState(false);
  const [origin, setOrigin] = useState(originRef.current);
  const [cursor, setCursor] = useState(cursorRef.current);
  const [insideBoard, setInsideBoard] = useState(false);
  const [placedBatches, setPlacedBatches] = useState([]);
  const [undoInfo, setUndoInfo] = useState(null);
  const [undoSeconds, setUndoSeconds] = useState(0);
  const [hint, setHint] = useState('');
  const [gatherVectors, setGatherVectors] = useState({});
  const [pickerClosing, setPickerClosing] = useState(false);
  const [guideCompleted, setGuideCompleted] = useState(
    () => window.localStorage.getItem(GUIDE_STORAGE_KEY) === 'true',
  );
  const [guideStage, setGuideStage] = useState('idle');
  const [guidePieceIds, setGuidePieceIds] = useState([]);
  const [guideCycle, setGuideCycle] = useState(0);
  const [guidePosition, setGuidePosition] = useState(null);
  const [displayedGuideStep, setDisplayedGuideStep] = useState(null);
  const [guideCopyVisible, setGuideCopyVisible] = useState(false);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = '预排布拖放交互 Demo';
    return () => {
      document.title = previousTitle;
      window.clearTimeout(holdTimerRef.current);
      window.clearTimeout(pickerCloseAnimationTimerRef.current);
      window.clearTimeout(guideCopyTimerRef.current);
      window.clearTimeout(guideHoldDelayTimerRef.current);
      window.clearInterval(guideCycleTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!undoInfo) {
      setUndoSeconds(0);
      return undefined;
    }

    const updateCountdown = () => {
      const remaining = Math.max(0, undoInfo.deadline - Date.now());
      setUndoSeconds(Math.ceil(remaining / 1000));
      if (remaining <= 0) setUndoInfo(null);
    };

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 200);
    return () => window.clearInterval(timer);
  }, [undoInfo]);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  const placedIdSet = useMemo(
    () => new Set(placedBatches.flatMap((batch) => batch.ids)),
    [placedBatches],
  );

  const availablePieces = useMemo(
    () => pieceOrder
      .filter((id) => !placedIdSet.has(id))
      .map((id) => PIECES.find((piece) => piece.id === id)),
    [pieceOrder, placedIdSet],
  );

  const selectedPieces = useMemo(
    () => selectedIds
      .filter((id) => !placedIdSet.has(id))
      .map((id) => PIECES.find((piece) => piece.id === id)),
    [placedIdSet, selectedIds],
  );

  const remainingGuideIds = guidePieceIds.filter((id) => !selectedIds.includes(id));
  const guideSelectableIds = guideStage === 'selectFirst'
    ? guidePieceIds.slice(0, 1)
    : guidePieceIds;
  const highlightedGuideIds = remainingGuideIds.filter((id) => guideSelectableIds.includes(id));
  const selectedKey = selectedIds.join(',');
  const guideTargetId = guideStage === 'selectFirst' || guideStage === 'selectMore'
    ? highlightedGuideIds[0]
    : guideStage === 'hold'
      ? selectedIds.at(-1)
      : guideStage === 'drag'
        ? holdPieceIdRef.current ?? selectedIds.at(-1)
      : null;
  const nextGuideStep = view !== 'select'
    ? null
    : guideStage === 'selectFirst'
      ? 'selectFirst'
      : guideStage === 'selectMore'
        ? 'selectMore'
      : guideStage === 'settling'
        ? 'selectMore'
      : guideStage === 'hold'
        ? 'hold'
        : guideStage === 'drag'
          ? 'drag'
          : null;

  useEffect(() => {
    window.clearTimeout(guideCopyTimerRef.current);

    if (nextGuideStep === displayedGuideStep) {
      setGuideCopyVisible(Boolean(nextGuideStep));
      return undefined;
    }

    setGuideCopyVisible(false);
    guideCopyTimerRef.current = window.setTimeout(() => {
      setDisplayedGuideStep(nextGuideStep);
    }, nextGuideStep === 'drag' ? 110 : 180);

    return () => window.clearTimeout(guideCopyTimerRef.current);
  }, [displayedGuideStep, nextGuideStep]);

  const scheduleHoldGuide = () => {
    window.clearTimeout(guideHoldDelayTimerRef.current);
    setGuideStage('settling');
    guideHoldDelayTimerRef.current = window.setTimeout(() => {
      setGuideStage(selectedIdsRef.current.length >= 2 ? 'hold' : 'selectMore');
    }, 1000);
  };

  useEffect(() => {
    window.clearInterval(guideCycleTimerRef.current);

    if (guideCompleted || (dragging && guideStage === 'drag')) return undefined;

    if (view !== 'select' || dragging || !availablePieces.length) {
      setGuideStage('idle');
      return undefined;
    }

    if (!guidePieceIds.length) {
      setGuidePieceIds(availablePieces.slice(0, 4).map((piece) => piece.id));
      return undefined;
    }

    if (guidePieceIds.every((id) => selectedIds.includes(id))) {
      if (guideStage !== 'settling' && guideStage !== 'hold') scheduleHoldGuide();
      return undefined;
    }

    const nextStage = selectedIds.includes(guidePieceIds[0]) ? 'selectMore' : 'selectFirst';
    setGuideStage(nextStage);
    setGuideCycle((cycle) => cycle + 1);
    guideCycleTimerRef.current = window.setInterval(() => {
      setGuideCycle((cycle) => cycle + 1);
    }, nextStage === 'selectMore' && highlightedGuideIds.length > 1 ? 3200 : 1100);

    return undefined;
  }, [availablePieces.length, dragging, guideCompleted, guidePieceIds, guideStage, highlightedGuideIds.length, selectedKey, view]);

  useEffect(() => {
    if (guideStage !== 'hold' && guideStage !== 'drag') return undefined;
    const timer = window.setInterval(() => {
      setGuideCycle((cycle) => cycle + 1);
    }, guideStage === 'hold' ? 3200 : 1800);
    return () => window.clearInterval(timer);
  }, [guideStage]);

  useLayoutEffect(() => {
    if (!guideTargetId || !pickerRef.current || !phoneRef.current || pickerClosing) {
      setGuidePosition(null);
      return undefined;
    }

    const measureTarget = () => {
      const target = pickerRef.current?.querySelector(`[data-piece-id="${guideTargetId}"]`);
      const phone = phoneRef.current;
      const board = boardRef.current;
      if (!target || !phone) return;
      const targetRect = target.getBoundingClientRect();
      const phoneRect = phone.getBoundingClientRect();
      const targetCenterY = targetRect.top + targetRect.height / 2;
      const boardRect = board?.getBoundingClientRect();
      const boardTop = boardRect?.top ?? targetCenterY - 132;
      const sweepTargets = highlightedGuideIds
        .map((id) => pickerRef.current?.querySelector(`[data-piece-id="${id}"]`))
        .filter(Boolean)
        .map((element) => element.getBoundingClientRect());
      const sweepCenters = sweepTargets.map((rect) => rect.left + rect.width / 2);
      const sweepX = sweepCenters.length > 1
        ? sweepCenters.at(-1) - sweepCenters[0]
        : 0;
      const sweepMidX = sweepCenters.length > 2
        ? sweepCenters[1] - sweepCenters[0]
        : sweepX / 2;
      setGuidePosition({
        x: targetRect.left - phoneRect.left + targetRect.width / 2,
        y: targetCenterY - phoneRect.top,
        dragY: boardTop - targetCenterY,
        sweepX,
        sweepMidX,
      });
    };

    const frame = window.requestAnimationFrame(measureTarget);
    return () => window.cancelAnimationFrame(frame);
  }, [guideTargetId, guideStage, pickerClosing, view, availablePieces.length, selectedKey, highlightedGuideIds.join(',')]);

  const layout = useMemo(() => {
    return buildBatchLayout(selectedPieces);
  }, [selectedPieces]);

  const layoutBounds = useMemo(() => {
    if (!layout.length) return { width: 0, height: 0 };
    return {
      width: Math.max(...layout.map((item) => item.x)) + 50,
      height: Math.max(...layout.map((item) => item.y)) + 50,
    };
  }, [layout]);

  const togglePiece = (id) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    const wasSelected = selectedIds.includes(id);
    const guideSelectionLocked = !guideCompleted
      && (guideStage === 'selectFirst' || guideStage === 'selectMore')
      && !guideSelectableIds.includes(id);
    if (guideSelectionLocked) return;

    const nextSelection = wasSelected
      ? selectedIds.filter((pieceId) => pieceId !== id)
      : [...selectedIds, id];

    setSelectedIds(nextSelection);
    selectedIdsRef.current = nextSelection;
    if (!guideCompleted
      && !wasSelected
      && (guideStage === 'settling' || guideStage === 'hold')) {
      scheduleHoldGuide();
    }
  };

  const pointInPlaySpace = ({ clientX, clientY }) => {
    const rect = playSpaceRef.current.getBoundingClientRect();
    const cursorPosition = {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
    const x = cursorPosition.x - layoutBounds.width / 2;
    const y = cursorPosition.y - layoutBounds.height - 34;
    return {
      x,
      y,
      cursor: cursorPosition,
      inside: pointInsideRect({ clientX, clientY }, rect)
        && batchFullyInsideRect({ x, y }, layoutBounds, rect),
    };
  };

  const updateOrigin = (pointer) => {
    const point = pointInPlaySpace(pointer);
    originRef.current = { x: point.x, y: point.y };
    cursorRef.current = point.cursor;
    insideBoardRef.current = point.inside;
    setOrigin(originRef.current);
    setCursor(cursorRef.current);
    setInsideBoard(point.inside);
    return point;
  };

  const beginPickerClose = () => {
    if (pickerClosingRef.current) return;
    pickerClosingRef.current = true;
    setPickerClosing(true);
    window.clearTimeout(pickerCloseAnimationTimerRef.current);
    pickerCloseAnimationTimerRef.current = window.setTimeout(() => {
      leftPickerRef.current = true;
      updateOrigin(lastPointerRef.current);
      setView('board');
      pickerClosingRef.current = false;
      setPickerClosing(false);
      setHint('预览就是最终排布，松手后原样落下');
    }, PICKER_CLOSE_ANIMATION_DURATION);
  };

  const activateDrag = (pointer, source) => {
    if (holdCancelledRef.current) return;
    suppressClickRef.current = source === 'picker';
    draggingRef.current = true;
    holdTargetRef.current?.setPointerCapture?.(pointerIdRef.current);

    if (source === 'picker' && pickerRef.current) {
      const vectors = {};
      selectedPieces.forEach((piece, index) => {
        const sourcePiece = pickerRef.current.querySelector(`[data-piece-id="${piece.id}"]`);
        if (!sourcePiece) return;
        const sourceRect = sourcePiece.getBoundingClientRect();
        const stackIndex = Math.min(index, 5);
        vectors[piece.id] = {
          x: sourceRect.left + sourceRect.width / 2 - pointer.clientX
            - stackIndex * CARRY_STACK_OFFSET_X,
          y: sourceRect.top + sourceRect.height / 2 - pointer.clientY
            + 47 + stackIndex * CARRY_STACK_OFFSET_Y,
        };
      });
      setGatherVectors(vectors);
      window.clearTimeout(pickerCloseAnimationTimerRef.current);
      pickerClosingRef.current = false;
      setPickerClosing(false);
      setGuideStage('drag');
    } else {
      setGatherVectors({});
    }

    setDragging(true);
    updateOrigin(pointer);
    setHint(source === 'picker'
      ? '向上拖出展开区域，查看最终排布预览'
      : '预览就是最终排布，松手后原样落下');
    navigator.vibrate?.(50);
  };

  const startHold = (event, source = 'tray', pieceId = null) => {
    if (selectedIds.length < 2 || (source === 'picker' && !selectedIds.includes(pieceId))) return;
    window.clearTimeout(holdTimerRef.current);
    pointerIdRef.current = event.pointerId;
    holdPieceIdRef.current = pieceId;
    gestureSourceRef.current = source;
    leftPickerRef.current = false;
    holdTargetRef.current = event.currentTarget;
    holdCancelledRef.current = false;
    holdStartRef.current = { x: event.clientX, y: event.clientY };
    lastPointerRef.current = { clientX: event.clientX, clientY: event.clientY };
    holdTimerRef.current = window.setTimeout(() => {
      activateDrag(lastPointerRef.current, source);
    }, HOLD_DELAY);
  };

  const moveGroup = (event) => {
    if (event.pointerId !== pointerIdRef.current) return;
    lastPointerRef.current = { clientX: event.clientX, clientY: event.clientY };

    if (!draggingRef.current) {
      if (holdShouldCancel(holdStartRef.current, { x: event.clientX, y: event.clientY })) {
        window.clearTimeout(holdTimerRef.current);
        holdCancelledRef.current = true;
      }
    }
    if (!draggingRef.current) return;
    event.preventDefault();
    updateOrigin(lastPointerRef.current);

    if (gestureSourceRef.current === 'picker' && view === 'select' && pickerRef.current) {
      const pickerTop = pickerRef.current.getBoundingClientRect().top;
      if (carryStackFullyAboveBoundary(lastPointerRef.current, pickerTop)) {
        beginPickerClose();
      }
    }
  };

  const finishGroup = (event) => {
    window.clearTimeout(holdTimerRef.current);
    if (!draggingRef.current) {
      if (holdCancelledRef.current) {
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 120);
      }
      pointerIdRef.current = null;
      gestureSourceRef.current = null;
      holdTargetRef.current = null;
      holdCancelledRef.current = false;
      return;
    }

    const source = gestureSourceRef.current;
    const point = updateOrigin({ clientX: event.clientX, clientY: event.clientY });
    const touchInterrupted = event.type === 'pointercancel';
    const canPlace = !touchInterrupted
      && point.inside
      && !(source === 'picker' && !leftPickerRef.current);
    if (canPlace) {
      window.clearTimeout(pickerCloseAnimationTimerRef.current);
      pickerClosingRef.current = false;
      setPickerClosing(false);
      const batchId = Date.now();
      const batchIds = [...selectedIds];
      setPlacedBatches((current) => [...current, {
        id: batchId,
        ids: batchIds,
        origin: { ...originRef.current },
        layout: layout.map(({ piece, x, y }) => ({ pieceId: piece.id, x, y })),
      }]);
      setUndoInfo({ batchId, deadline: Date.now() + UNDO_DURATION });
      setSelectedIds([]);
      setView('board');
      setHint('已放置，可继续展开选择其他拼图块');
      if (!guideCompleted) {
        window.localStorage.setItem(GUIDE_STORAGE_KEY, 'true');
        setGuideCompleted(true);
        setGuideStage('complete');
      }
    } else {
      const failedIds = [...selectedIds];
      setPieceOrder((current) => [
        ...failedIds,
        ...current.filter((id) => !failedIds.includes(id)),
      ]);
      setView('board');
      setHint(touchInterrupted
        ? '操作已中断，选择已保留'
        : '未放置：请确保所有碎片都在操作台内');
      if (!guideCompleted) setGuideStage('hold');
    }

    draggingRef.current = false;
    pointerIdRef.current = null;
    gestureSourceRef.current = null;
    holdTargetRef.current = null;
    holdCancelledRef.current = false;
    leftPickerRef.current = false;
    insideBoardRef.current = false;
    setDragging(false);
    setInsideBoard(false);
    setGatherVectors({});
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 120);
  };

  useEffect(() => {
    const moveAnywhere = (event) => moveGroup(event);
    const finishAnywhere = (event) => {
      if (event.pointerId === pointerIdRef.current) finishGroup(event);
    };
    window.addEventListener('pointermove', moveAnywhere, { passive: false });
    window.addEventListener('pointerup', finishAnywhere);
    window.addEventListener('pointercancel', finishAnywhere);
    return () => {
      window.removeEventListener('pointermove', moveAnywhere);
      window.removeEventListener('pointerup', finishAnywhere);
      window.removeEventListener('pointercancel', finishAnywhere);
    };
  });

  const reset = () => {
    window.clearTimeout(pickerCloseAnimationTimerRef.current);
    window.clearTimeout(guideHoldDelayTimerRef.current);
    pickerClosingRef.current = false;
    setPickerClosing(false);
    setView('board');
    setPieceOrder(PIECES.map((piece) => piece.id));
    setSelectedIds(INITIAL_SELECTION);
    setPlacedBatches([]);
    setUndoInfo(null);
    setDragging(false);
    draggingRef.current = false;
    setInsideBoard(false);
    setHint('');
  };

  const renderGroup = (at, mode) => layout.map(({ piece, x, y }) => (
    <PuzzlePiece
      key={`${mode}-${piece.id}`}
      piece={piece}
      className={`group-piece ${mode}`}
      style={{ left: at.x + x, top: at.y + y }}
    />
  ));

  const renderPlacedBatch = (batch) => batch.layout.map(({ pieceId, x, y }) => {
    const piece = PIECES.find((candidate) => candidate.id === pieceId);
    return (
      <PuzzlePiece
        key={`settled-${batch.id}-${pieceId}`}
        piece={piece}
        className="group-piece settled"
        style={{ left: batch.origin.x + x, top: batch.origin.y + y }}
      />
    );
  });

  const undoLatestPlacement = () => {
    if (!undoInfo) return;
    const batch = placedBatches.find((candidate) => candidate.id === undoInfo.batchId);
    if (!batch) {
      setUndoInfo(null);
      return;
    }

    setPlacedBatches((current) => current.filter((candidate) => candidate.id !== batch.id));
    setPieceOrder((current) => [
      ...batch.ids,
      ...current.filter((id) => !batch.ids.includes(id)),
    ]);
    setSelectedIds(batch.ids);
    setUndoInfo(null);
    setHint('已撤销，本组拼图块已恢复选择');
    setView('board');
  };

  const resetGuide = () => {
    window.localStorage.removeItem(GUIDE_STORAGE_KEY);
    window.clearTimeout(holdTimerRef.current);
    window.clearTimeout(pickerCloseAnimationTimerRef.current);
    window.clearTimeout(guideHoldDelayTimerRef.current);
    setGuideCompleted(false);
    setGuideStage('idle');
    setGuidePieceIds([]);
    setSelectedIds([]);
    selectedIdsRef.current = [];
    setDragging(false);
    draggingRef.current = false;
    setGatherVectors({});
    setPickerClosing(false);
    pickerClosingRef.current = false;
    setView('board');
    setHint('引导已重置，点击展开重新体验');
  };

  const renderCarryStack = () => {
    const visibleIds = visibleCarryPieceIds(
      selectedPieces.map((piece) => piece.id),
      holdPieceIdRef.current,
    );
    const visiblePieces = visibleIds.map((id) => (
      selectedPieces.find((piece) => piece.id === id)
    ));

    return visiblePieces.map((piece, index) => (
      <PuzzlePiece
        key={`carry-${piece.id}`}
        piece={piece}
        className={`carry-piece ${view === 'select' ? 'gathering' : ''}`}
        style={{
          left: cursor.x - 25 + index * CARRY_STACK_OFFSET_X,
          top: cursor.y - 72 - index * CARRY_STACK_OFFSET_Y,
          zIndex: 31 + index,
          '--gather-x': `${gatherVectors[piece.id]?.x ?? 0}px`,
          '--gather-y': `${gatherVectors[piece.id]?.y ?? 0}px`,
          '--gather-delay': `${index * 38}ms`,
          '--stack-rotate': `${index === 0 ? -2.2 : 1.2}deg`,
        }}
      />
    ));
  };

  return (
    <main className="mobile-demo-stage">
      <section className="phone-demo" data-phone-screen ref={phoneRef}>
        <div className="status-strip">
          <b>11:07</b>
          <span>● ● ●　⌁　59</span>
        </div>

        <div className="game-tools">
          {displayedGuideStep && (
            <div
              className={`guide-copy-message ${guideCopyVisible ? 'is-visible' : ''}`}
              role="status"
              aria-live="polite"
            >
              <span>{GUIDE_COPY[displayedGuideStep]}</span>
            </div>
          )}
        </div>

        {undoInfo && (
          <button type="button" className="undo-banner" onClick={undoLatestPlacement}>
            撤销本次放置 <span>{undoSeconds}s</span>
          </button>
        )}

        <div className={`play-space ${view === 'select' ? 'drawer-open' : ''}`} ref={playSpaceRef}>
          <div className="puzzle-board" ref={boardRef} aria-label="拼图作图区域">
            <div className="board-watermark">作图区域</div>
          </div>

          {INITIAL_BOARD_PIECES.map((item) => {
            const piece = PIECES.find((candidate) => candidate.id === item.pieceId);
            return (
              <PuzzlePiece
                key={`existing-${item.pieceId}`}
                piece={piece}
                className="existing-board-piece"
                style={{ left: item.x, top: item.y, transform: `rotate(${item.rotate}deg)` }}
              />
            );
          })}

          {placedBatches.map((batch) => renderPlacedBatch(batch))}
          {dragging && view === 'board' && renderGroup(origin, insideBoard ? 'preview valid' : 'preview invalid')}
          {dragging && view === 'select' && renderCarryStack()}

          {view === 'select' && (
            <section className={`expanded-picker ${pickerClosing ? 'picker-closing' : ''}`} ref={pickerRef}>
              <button
                type="button"
                className="collapse-picker"
                onClick={() => {
                  window.clearTimeout(pickerCloseAnimationTimerRef.current);
                  window.clearTimeout(guideHoldDelayTimerRef.current);
                  pickerClosingRef.current = false;
                  setPickerClosing(false);
                  setSelectedIds([]);
                  setView('board');
                  setHint('已收起，当前选择已清空');
                }}
                aria-label="收起拼图列表"
              >
                <CaretDown size={35} weight="regular" aria-hidden="true" />
              </button>
              <div className="expanded-grid">
                {availablePieces.map((piece) => {
                  const selected = selectedIds.includes(piece.id);
                  const selectionLocked = !guideCompleted
                    && (guideStage === 'selectFirst' || guideStage === 'selectMore')
                    && !guideSelectableIds.includes(piece.id);
                  const guideTarget = !guideCompleted
                    && (guideStage === 'selectFirst' || guideStage === 'selectMore')
                    && highlightedGuideIds.includes(piece.id);
                  return (
                    <PuzzlePiece
                      key={piece.id}
                      piece={piece}
                      className={`${dragging && selected ? 'source-piece-hidden' : ''} ${guideTarget ? 'guide-target-piece' : ''}`}
                      selected={selected}
                      disabled={selectionLocked}
                      onClick={() => togglePiece(piece.id)}
                      onPointerDown={(event) => startHold(event, 'picker', piece.id)}
                      label={`${selected ? '取消选择' : '选择'}碎片 ${piece.id}`}
                    />
                  );
                })}
              </div>
            </section>
          )}
        </div>

          {guidePosition
          && ((((guideStage === 'selectFirst' || guideStage === 'selectMore') || guideStage === 'hold') && !dragging)
            || (guideStage === 'drag' && dragging && view === 'select'))
          && (
          <div
            className={`gesture-guide gesture-guide-${guideStage === 'selectFirst' || (guideStage === 'selectMore' && highlightedGuideIds.length === 1) ? 'click' : guideStage === 'selectMore' ? 'sweep' : guideStage} ${guideStage === 'selectMore' ? `sweep-${highlightedGuideIds.length}` : ''}`}
            style={{
              left: guidePosition.x,
              top: guidePosition.y,
              '--guide-drag-y': `${guidePosition.dragY}px`,
              '--guide-sweep-x': `${guidePosition.sweepX}px`,
              '--guide-sweep-mid-x': `${guidePosition.sweepMidX}px`,
            }}
            aria-hidden="true"
          >
            <span className="gesture-guide-ring" />
            {guideStage === 'drag' && (
              <span className="gesture-guide-trail">
                {[0, 1, 2].map((trailIndex) => (
                  <img
                    key={`trail-${trailIndex}-${guideCycle}`}
                    src={`${import.meta.env.BASE_URL}assets/onboarding-hand.png`}
                    alt=""
                    style={{
                      '--trail-delay': `${(trailIndex + 1) * 0.09}s`,
                      '--trail-opacity': 0.2 - trailIndex * 0.055,
                    }}
                  />
                ))}
              </span>
            )}
            <img
              key={`${guideStage}-${guideTargetId}-${guideCycle}`}
              className="gesture-guide-hand"
              src={`${import.meta.env.BASE_URL}assets/onboarding-hand.png`}
              alt=""
            />
          </div>
        )}

        {view === 'board' && (
          <section className="piece-tray">
            <button
              type="button"
              className="expand-picker"
              onClick={() => {
                setView('select');
                if (!guideCompleted) setGuideStage(selectedIds.length >= 2 ? 'hold' : 'selectFirst');
              }}
            >展开</button>
            <div className="collapsed-piece-strip" aria-label="未放置拼图块">
              {availablePieces.slice(0, 5).map((piece, index) => (
                <PuzzlePiece
                  key={piece.id}
                  piece={piece}
                  className="tray-piece"
                  selected={selectedIds.includes(piece.id)}
                  style={{ zIndex: index + 1 }}
                />
              ))}
              {!availablePieces.length && <span className="empty-tray">没有剩余拼图块</span>}
            </div>
            <div className="tray-hint">{hint}</div>
          </section>
        )}

        <footer className="game-brand">
          <span>Jigsaw Puzzles</span>
          <button type="button" className="reset-guide" onClick={resetGuide}>重置引导</button>
        </footer>
      </section>
    </main>
  );
}

export { BatchPlaceDemo };
