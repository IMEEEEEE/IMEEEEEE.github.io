(() => {
  const tabs = [...document.querySelectorAll("[data-view-target]")];
  const views = [...document.querySelectorAll("[data-view]")];
  const pageNavs = [...document.querySelectorAll("[data-page-nav]")];
  const viewNames = views.map((view) => view.dataset.view);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const appleWebKitPhotography = /AppleWebKit/i.test(navigator.userAgent)
    && !/(Chrome|Chromium|CriOS|Edg|EdgiOS|OPR|FxiOS)/i.test(navigator.userAgent);
  const stepDelay = 40;
  const fadeDuration = 200;
  const treeStepDelay = 24;
  const treeFadeDuration = 120;
  const treePulseDuration = 340;
  const acousticSecondPageFadeMs = 480;
  const acousticAplFadeMs = 320;
  const acousticAplExitMs = 480;
  const acousticScanResultFadeMs = 480;
  const acousticScanCompleteHoldMs = 2000;
  const acousticAplIntroHoldMs = 1000;
  const timelineDrawDuration = 280;
  const timelineCardPulseDuration = 520;
  let activeName = "profile";
  let switching = false;
  let sectionSwitching = false;
  let pendingName = null;

  if (!tabs.length || !views.length) return;

  document.querySelector(".portfolio").addEventListener("dragstart", (event) => event.preventDefault());

  document.querySelectorAll(".contact a").forEach((link) => {
    let animationTimer;
    link.addEventListener("click", () => {
      window.clearTimeout(animationTimer);
      link.classList.remove("icon-pop");
      void link.offsetWidth;
      link.classList.add("icon-pop");
      animationTimer = window.setTimeout(() => link.classList.remove("icon-pop"), 400);
    });
  });

  const initThermalDemo = () => {
    const demo = document.querySelector("[data-thermal-demo]");
    if (!demo) return;

    const canvas = demo.querySelector("[data-thermal-canvas]");
    const context = canvas?.getContext("2d");
    const schedulerButtons = [...demo.querySelectorAll("[data-scheduler-mode]")];
    const pipelineOutput = demo.querySelector("[data-comparison-pipeline]");
    const aiOutput = demo.querySelector("[data-comparison-ai]");
    const temperatureLimitInput = demo.querySelector("[data-ai-temp-limit]");
    const temperatureLimitOutput = demo.querySelector("[data-ai-temp-output]");
    if (!canvas || !context || !schedulerButtons.length) return;

    const INITIAL_TEMPERATURES = Array(6).fill(50);
    const THERMAL_LIMIT = 85;
    const THERMAL_WARM_TEMPERATURE = 65;
    const DEFAULT_AI_TEMPERATURE_LIMIT = 65;
    const RESET_ENTRY_DURATION = .65;
    const RESET_UNPACK_DURATION = .65;
    const RESET_DURATION = RESET_ENTRY_DURATION + RESET_UNPACK_DURATION;
    const DEVICE_THERMAL_FACTORS = [.72, .94, 1.2, 1.24, .92, .76];
    const GRID_SIZE = 9;
    const TILE_COUNT = GRID_SIZE * GRID_SIZE;

    const thermalState = {
      aiEnabled: false,
      aiTemperatureLimit: DEFAULT_AI_TEMPERATURE_LIMIT,
      workload: 72,
      temperatures: [...INITIAL_TEMPERATURES],
      frequencies: Array(6).fill(1000),
      tiles: [],
      queues: Array.from({ length: 6 }, () => []),
      activeTiles: Array(6).fill(null),
      dispatches: [],
      pipelineCursor: 0,
      completedTiles: 0,
      roundElapsed: 0,
      phase: "processing",
      phaseElapsed: 0,
      resetFromTemperatures: [...INITIAL_TEMPERATURES],
      results: { pipeline: null, ai: null },
      chipRects: [],
      width: 0,
      height: 0,
      lastTime: performance.now()
    };

    let palette = {};

    const readPalette = () => {
      const styles = getComputedStyle(demo);
      palette = {
        accent: styles.getPropertyValue("--accent").trim() || "rgb(78, 218, 122)",
        accentForeground: styles.getPropertyValue("--accent-foreground").trim() || "#ffffff",
        thermalWarm: styles.getPropertyValue("--thermal-warm").trim() || styles.getPropertyValue("--accent").trim() || "rgb(78, 218, 122)",
        thermalHot: styles.getPropertyValue("--thermal-hot").trim() || styles.getPropertyValue("--accent").trim() || "rgb(78, 218, 122)",
        accentSubtleStrength: (parseFloat(styles.getPropertyValue("--accent-subtle-strength")) || 12) / 100,
        accentBaseStrength: (parseFloat(styles.getPropertyValue("--accent-base-strength")) || 24) / 100,
        accentActiveStrength: (parseFloat(styles.getPropertyValue("--accent-active-strength")) || 70) / 100,
        accentSolidStrength: (parseFloat(styles.getPropertyValue("--accent-solid-strength")) || 100) / 100,
        heading: styles.getPropertyValue("--heading").trim() || "#242624",
        muted: styles.getPropertyValue("--muted").trim() || "#777974",
        faint: styles.getPropertyValue("--faint").trim() || "#a2a39f",
        line: styles.getPropertyValue("--line").trim() || "#e5e5e2",
        paper: styles.getPropertyValue("--paper").trim() || "#ffffff",
        uiSize: styles.getPropertyValue("--thermal-ui-size").trim() || ".8rem",
        metaSize: styles.getPropertyValue("--thermal-meta-size").trim() || ".7rem"
      };
    };

    const parseRgb = (value, fallback) => {
      const values = value.match(/[\d.]+/g);
      return values?.length >= 3 ? values.slice(0, 3).map(Number) : fallback;
    };

    const mixColor = (start, end, amount) => start.map((value, index) => (
      Math.round(value + (end[index] - value) * amount)
    ));

    const moveToward = (current, target, maximumChange) => {
      if (Math.abs(target - current) <= maximumChange) return target;
      return current + Math.sign(target - current) * maximumChange;
    };

    const thermalColor = (temperature) => {
      const cool = parseRgb(palette.accent, [78, 218, 122]);
      const warm = parseRgb(palette.thermalWarm, cool);
      const hot = parseRgb(palette.thermalHot, cool);
      if (temperature <= INITIAL_TEMPERATURES[0]) return cool;
      if (temperature <= THERMAL_WARM_TEMPERATURE) {
        const warmProgress = (temperature - INITIAL_TEMPERATURES[0])
          / (THERMAL_WARM_TEMPERATURE - INITIAL_TEMPERATURES[0]);
        return mixColor(cool, warm, warmProgress);
      }
      const hotProgress = Math.max(0, Math.min(1, (
        temperature - THERMAL_WARM_TEMPERATURE
      ) / (THERMAL_LIMIT - THERMAL_WARM_TEMPERATURE)));
      return mixColor(warm, hot, hotProgress);
    };

    const rgba = (rgb, alpha) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;

    const roundedPath = (x, y, pathWidth, pathHeight, radius) => {
      const r = Math.min(radius, pathWidth / 2, pathHeight / 2);
      context.beginPath();
      context.moveTo(x + r, y);
      context.arcTo(x + pathWidth, y, x + pathWidth, y + pathHeight, r);
      context.arcTo(x + pathWidth, y + pathHeight, x, y + pathHeight, r);
      context.arcTo(x, y + pathHeight, x, y, r);
      context.arcTo(x, y, x + pathWidth, y, r);
      context.closePath();
    };

    const tilePath = (x, y, pathWidth, pathHeight, corner) => {
      const r = Math.min(Math.max(1.5, Math.min(pathWidth, pathHeight) * .16), pathWidth / 2, pathHeight / 2);
      const topLeft = corner === "all" || corner === "top-left";
      const topRight = corner === "all" || corner === "top-right";
      const bottomRight = corner === "all" || corner === "bottom-right";
      const bottomLeft = corner === "all" || corner === "bottom-left";

      context.beginPath();
      context.moveTo(x + (topLeft ? r : 0), y);
      context.lineTo(x + pathWidth - (topRight ? r : 0), y);
      if (topRight) context.quadraticCurveTo(x + pathWidth, y, x + pathWidth, y + r);
      else context.lineTo(x + pathWidth, y);
      context.lineTo(x + pathWidth, y + pathHeight - (bottomRight ? r : 0));
      if (bottomRight) context.quadraticCurveTo(x + pathWidth, y + pathHeight, x + pathWidth - r, y + pathHeight);
      else context.lineTo(x + pathWidth, y + pathHeight);
      context.lineTo(x + (bottomLeft ? r : 0), y + pathHeight);
      if (bottomLeft) context.quadraticCurveTo(x, y + pathHeight, x, y + pathHeight - r);
      else context.lineTo(x, y + pathHeight);
      context.lineTo(x, y + (topLeft ? r : 0));
      if (topLeft) context.quadraticCurveTo(x, y, x + r, y);
      else context.lineTo(x, y);
      context.closePath();
    };

    const frequencyForTemperature = (temperature) => {
      if (temperature >= 82) return 600;
      if (temperature >= 78) return 700;
      if (temperature >= 74) return 800;
      if (temperature >= 70) return 900;
      return 1000;
    };

    const frequencyForAiTemperature = (temperature, deviceIndex) => {
      const thermalBias = (DEVICE_THERMAL_FACTORS[deviceIndex] - 1) * 2;
      const headroom = thermalState.aiTemperatureLimit - temperature - thermalBias;
      if (headroom <= 0) return 600;
      if (headroom <= .75) return 700;
      if (headroom <= 1.5) return 800;
      if (headroom <= 3) return 900;
      return 1000;
    };

    const frequencyForDevice = (temperature, deviceIndex) => thermalState.aiEnabled
      ? frequencyForAiTemperature(temperature, deviceIndex)
      : frequencyForTemperature(temperature);

    const waitingTile = () => thermalState.tiles.find((tile) => tile.status === "waiting");
    const waitingTiles = (count) => thermalState.tiles.filter((tile) => tile.status === "waiting").slice(0, count);

    const queueDepth = (deviceIndex) => (
      thermalState.queues[deviceIndex].length
      + (thermalState.activeTiles[deviceIndex] === null ? 0 : 1)
      + thermalState.dispatches.filter((dispatch) => dispatch.deviceIndex === deviceIndex).length
    );

    const deviceIsFree = (deviceIndex) => queueDepth(deviceIndex) === 0;

    const bestDeviceForNextTile = () => {
      const scores = thermalState.temperatures.map((temperature, index) => {
        if (!deviceIsFree(index)) return -Infinity;
        const headroom = Math.max(.25, thermalState.aiTemperatureLimit - temperature);
        const frequency = thermalState.frequencies[index] / 1000;
        return headroom * headroom * frequency;
      });
      const bestScore = Math.max(...scores);
      return Number.isFinite(bestScore) ? scores.indexOf(bestScore) : -1;
    };

    const aiBatchSize = (deviceIndex) => {
      const temperature = thermalState.temperatures[deviceIndex];
      const headroom = thermalState.aiTemperatureLimit - temperature;
      const thermalCapacity = headroom > 18 ? 4 : headroom > 12 ? 3 : headroom > 6 ? 2 : 1;
      return deviceIsFree(deviceIndex) ? thermalCapacity : 0;
    };

    const dispatchTile = (tile, deviceIndex) => {
      tile.owner = deviceIndex;
      tile.status = "dispatching";
      thermalState.dispatches.push({
        tileIndex: tile.index,
        deviceIndex,
        progress: 0,
        duration: .48
      });
    };

    const nextPipelineDevice = () => {
      for (let offset = 0; offset < 6; offset += 1) {
        const deviceIndex = (thermalState.pipelineCursor + offset) % 6;
        if (!deviceIsFree(deviceIndex)) continue;
        thermalState.pipelineCursor = (deviceIndex + 1) % 6;
        return deviceIndex;
      }
      return -1;
    };

    const scheduleDispatch = () => {
      while (waitingTile()) {
        const deviceIndex = thermalState.aiEnabled ? bestDeviceForNextTile() : nextPipelineDevice();
        if (deviceIndex < 0) return;

        if (thermalState.aiEnabled) {
          waitingTiles(aiBatchSize(deviceIndex)).forEach((waiting) => dispatchTile(waiting, deviceIndex));
        } else {
          dispatchTile(waitingTile(), deviceIndex);
        }
      }
    };

    const updateDispatches = (deltaTime) => {
      thermalState.dispatches.forEach((dispatch) => {
        dispatch.progress = Math.min(1, dispatch.progress + deltaTime / dispatch.duration);
        if (dispatch.progress < 1) return;
        const tile = thermalState.tiles[dispatch.tileIndex];
        tile.status = "queued";
        thermalState.queues[dispatch.deviceIndex].push(dispatch.tileIndex);
      });
      thermalState.dispatches = thermalState.dispatches.filter((dispatch) => dispatch.progress < 1);
    };

    const beginRound = ({ animateReset = true } = {}) => {
      thermalState.resetFromTemperatures = [...thermalState.temperatures];
      thermalState.tiles = Array.from({ length: TILE_COUNT }, (_, index) => ({
        index,
        owner: -1,
        status: "waiting",
        progress: 0,
        visualTint: 0,
        visualAlpha: palette.accentBaseStrength
      }));
      thermalState.queues = Array.from({ length: 6 }, () => []);
      thermalState.activeTiles = Array(6).fill(null);
      thermalState.dispatches = [];
      thermalState.pipelineCursor = 0;
      thermalState.completedTiles = 0;
      thermalState.roundElapsed = 0;
      thermalState.phase = animateReset && !reduceMotion ? "resetting" : "processing";
      thermalState.phaseElapsed = 0;
      if (thermalState.phase === "processing") {
        thermalState.temperatures = [...INITIAL_TEMPERATURES];
        thermalState.frequencies = INITIAL_TEMPERATURES.map(frequencyForDevice);
        scheduleDispatch();
      }
    };

    const completeTile = (deviceIndex, tileIndex) => {
      const tile = thermalState.tiles[tileIndex];
      tile.status = "done";
      tile.progress = 1;
      thermalState.activeTiles[deviceIndex] = null;
      thermalState.completedTiles += 1;
      if (thermalState.completedTiles === TILE_COUNT) {
        const mode = thermalState.aiEnabled ? "ai" : "pipeline";
        thermalState.results[mode] = {
          time: thermalState.roundElapsed
        };
        thermalState.phase = "packing";
        thermalState.phaseElapsed = 0;
      } else {
        scheduleDispatch();
      }
    };

    const updateTileVisuals = (deltaTime) => {
      const colorStep = deltaTime / .28;
      const alphaStep = deltaTime / .24;
      thermalState.tiles.forEach((tile) => {
        const targetAlpha = tile.status === "done" ? palette.accentActiveStrength : palette.accentBaseStrength;
        tile.visualTint = moveToward(tile.visualTint, tile.owner >= 0 ? 1 : 0, colorStep);
        tile.visualAlpha = moveToward(tile.visualAlpha, targetAlpha, alphaStep);
      });
    };

    const updateSimulation = (deltaTime) => {
      thermalState.frequencies = thermalState.temperatures.map(frequencyForDevice);
      updateTileVisuals(deltaTime);

      if (thermalState.phase === "resetting") {
        thermalState.phaseElapsed += deltaTime;
        const progress = Math.min(1, thermalState.phaseElapsed / RESET_DURATION);
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        thermalState.temperatures = thermalState.resetFromTemperatures.map((temperature, index) => (
          temperature + (INITIAL_TEMPERATURES[index] - temperature) * easedProgress
        ));
        thermalState.frequencies = thermalState.temperatures.map(frequencyForDevice);
        if (progress >= 1) {
          thermalState.temperatures = [...INITIAL_TEMPERATURES];
          thermalState.frequencies = INITIAL_TEMPERATURES.map(frequencyForDevice);
          thermalState.phase = "processing";
          thermalState.phaseElapsed = 0;
          scheduleDispatch();
        }
        return;
      }

      if (thermalState.phase !== "processing") {
        thermalState.phaseElapsed += deltaTime;
        if (thermalState.phase === "packing" && thermalState.phaseElapsed >= .8) {
          thermalState.phase = "sending";
          thermalState.phaseElapsed = 0;
        } else if (thermalState.phase === "sending" && thermalState.phaseElapsed >= 1.05) {
          beginRound();
        }
        return;
      }

      thermalState.roundElapsed += deltaTime;
      updateDispatches(deltaTime);

      thermalState.activeTiles.forEach((activeTile, deviceIndex) => {
        if (activeTile !== null || !thermalState.queues[deviceIndex].length) return;
        const tileIndex = thermalState.queues[deviceIndex].shift();
        thermalState.activeTiles[deviceIndex] = tileIndex;
        thermalState.tiles[tileIndex].status = "running";
      });

      const intensity = thermalState.workload / 100;
      const secondsPerTile = .24 + intensity * .44;
      thermalState.activeTiles.forEach((tileIndex, deviceIndex) => {
        if (tileIndex === null) return;
        const tile = thermalState.tiles[tileIndex];
        tile.progress += deltaTime * (thermalState.frequencies[deviceIndex] / 1000) / secondsPerTile;
        if (tile.progress >= 1) completeTile(deviceIndex, tileIndex);
      });

      thermalState.temperatures = thermalState.temperatures.map((temperature, index) => {
        const running = thermalState.activeTiles[index] !== null;
        const frequencyFactor = thermalState.frequencies[index] / 1000;
        const heating = running
          ? (3.2 + intensity * 3.8) * Math.pow(frequencyFactor, 3.4) * DEVICE_THERMAL_FACTORS[index]
          : 0;
        const cooling = Math.max(0, temperature - 30) * .035;
        return Math.max(30, Math.min(THERMAL_LIMIT, temperature + (heating - cooling) * deltaTime));
      });

    };

    const pointOnCurve = (start, control, end, progress) => {
      const inverse = 1 - progress;
      return {
        x: inverse * inverse * start.x + 2 * inverse * progress * control.x + progress * progress * end.x,
        y: inverse * inverse * start.y + 2 * inverse * progress * control.y + progress * progress * end.y
      };
    };

    const draw = (time = 0) => {
      const { width, height } = thermalState;
      if (width < 10 || height < 10) return;

      context.clearRect(0, 0, width, height);
      const compact = width < 430;
      const groupGap = compact ? 8 : 12;
      const squareSize = Math.max(60, (width - groupGap) / 2);
      const stackLeft = 0;
      const gridLeft = stackLeft + squareSize + groupGap;
      const tileGap = 2;
      const tileSize = (squareSize - tileGap * (GRID_SIZE - 1)) / GRID_SIZE;
      const gridWidth = squareSize;
      const gridHeight = gridWidth;
      const gridTop = (height - gridHeight) / 2;
      const chipGap = compact ? 5 : 7;
      const chipHeight = (squareSize - chipGap * 5) / 6;
      const centerTile = Math.floor(GRID_SIZE / 2);
      const centerTileIndex = centerTile * GRID_SIZE + centerTile;
      const centerTileCenter = {
        x: gridLeft + centerTile * (tileSize + tileGap) + tileSize / 2,
        y: gridTop + centerTile * (tileSize + tileGap) + tileSize / 2
      };
      const packProgress = thermalState.phase === "packing"
        ? Math.min(1, thermalState.phaseElapsed / .8)
        : thermalState.phase === "sending" ? 1 : 0;
      const easedPackProgress = 1 - Math.pow(1 - packProgress, 3);
      const resetEntryProgress = thermalState.phase === "resetting"
        ? Math.min(1, thermalState.phaseElapsed / RESET_ENTRY_DURATION)
        : 1;
      const resetUnpackProgress = thermalState.phase === "resetting"
        ? Math.max(0, Math.min(1, (thermalState.phaseElapsed - RESET_ENTRY_DURATION) / RESET_UNPACK_DURATION))
        : 1;
      const easedResetUnpackProgress = 1 - Math.pow(1 - resetUnpackProgress, 3);

      thermalState.chipRects = thermalState.temperatures.map((_, index) => ({
        x: stackLeft,
        y: gridTop + index * (chipHeight + chipGap),
        width: squareSize,
        height: chipHeight
      }));

      thermalState.dispatches.forEach((dispatch) => {
        const tile = thermalState.tiles[dispatch.tileIndex];
        const column = tile.index % GRID_SIZE;
        const row = Math.floor(tile.index / GRID_SIZE);
        const start = {
          x: gridLeft + column * (tileSize + tileGap) + tileSize / 2,
          y: gridTop + row * (tileSize + tileGap) + tileSize / 2
        };
        const rect = thermalState.chipRects[dispatch.deviceIndex];
        const end = { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
        const control = { x: end.x + (start.x - end.x) * .52, y: end.y };
        const color = thermalColor(thermalState.temperatures[dispatch.deviceIndex]);
        const lineFadeIn = Math.min(1, dispatch.progress / .18);
        const lineFadeOut = Math.min(1, (1 - dispatch.progress) / .28);
        const lineAlpha = palette.accentBaseStrength * Math.min(lineFadeIn, lineFadeOut);

        context.save();
        context.strokeStyle = rgba(color, lineAlpha);
        context.lineWidth = 1.5;
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.quadraticCurveTo(control.x, control.y, end.x, end.y);
        context.stroke();

        const point = pointOnCurve(start, control, end, reduceMotion ? 1 : dispatch.progress);
        context.beginPath();
        context.fillStyle = rgba(color, palette.accentSolidStrength);
        context.arc(point.x, point.y, compact ? 2.4 : 3, 0, Math.PI * 2);
        context.fill();
        context.restore();
      });

      thermalState.chipRects.forEach((rect, index) => {
        const temperature = thermalState.temperatures[index];
        const color = thermalColor(temperature);
        const occupied = !deviceIsFree(index);
        const throttled = thermalState.frequencies[index] < 1000;
        const stateColor = color;

        roundedPath(rect.x, rect.y, rect.width, rect.height, compact ? 5 : 7);
        context.fillStyle = rgba(stateColor, occupied ? palette.accentBaseStrength : palette.accentSubtleStrength);
        context.fill();
        context.strokeStyle = rgba(stateColor, occupied ? palette.accentActiveStrength : palette.accentBaseStrength);
        context.lineWidth = occupied ? 1.35 : 1;
        context.stroke();

        const textY = rect.y + rect.height * .38;
        context.fillStyle = palette.muted;
        context.font = `500 ${palette.uiSize} "IBM Plex Mono", monospace`;
        context.textAlign = "left";
        context.textBaseline = "middle";
        context.fillText(`Pi ${index + 1}`, rect.x + 10, textY);

        context.fillStyle = throttled
          ? rgba(color, palette.accentSolidStrength)
          : palette.muted;
        context.font = `500 ${palette.metaSize} "IBM Plex Mono", monospace`;
        context.fillText(`${thermalState.frequencies[index]} MHz`, rect.x + (compact ? 112 : 142), textY);

        const barStart = rect.x + 10;
        const barEnd = rect.x + rect.width - 10;
        const barY = rect.y + rect.height - (compact ? 6 : 7);
        const currentX = barStart + (barEnd - barStart) * Math.max(0, Math.min(1, (temperature - 30) / (THERMAL_LIMIT - 30)));
        context.strokeStyle = palette.line;
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(barStart, barY);
        context.lineTo(barEnd, barY);
        context.stroke();
        context.strokeStyle = rgba(color, palette.accentSolidStrength);
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(barStart, barY);
        context.lineTo(currentX, barY);
        context.stroke();

        if (thermalState.aiEnabled) {
          const limitX = barStart + (barEnd - barStart) * ((thermalState.aiTemperatureLimit - 30) / (THERMAL_LIMIT - 30));
          context.strokeStyle = rgba(thermalColor(thermalState.aiTemperatureLimit), palette.accentSolidStrength);
          context.lineWidth = 1;
          context.beginPath();
          context.moveTo(limitX, barY - 4);
          context.lineTo(limitX, barY + 4);
          context.stroke();
        }

        context.fillStyle = palette.muted;
        context.font = `500 ${palette.uiSize} "IBM Plex Mono", monospace`;
        context.textAlign = "right";
        context.fillText(`${Math.round(temperature)}°`, rect.x + rect.width - 10, textY);
      });

      thermalState.tiles.forEach((tile, index) => {
        if (thermalState.phase === "sending") return;
        const column = index % GRID_SIZE;
        const row = Math.floor(index / GRID_SIZE);
        const corner = row === 0 && column === 0 ? "top-left"
          : row === 0 && column === GRID_SIZE - 1 ? "top-right"
            : row === GRID_SIZE - 1 && column === GRID_SIZE - 1 ? "bottom-right"
              : row === GRID_SIZE - 1 && column === 0 ? "bottom-left"
                : null;
        const isCenterTile = index === centerTileIndex;
        const visibleCorner = thermalState.phase === "packing" && isCenterTile ? "all" : corner;
        const x = gridLeft + column * (tileSize + tileGap);
        const y = gridTop + row * (tileSize + tileGap);
        const tileCenterX = x + tileSize / 2;
        const tileCenterY = y + tileSize / 2;
        const packedCenterX = tileCenterX + (centerTileCenter.x - tileCenterX) * easedPackProgress;
        const packedCenterY = tileCenterY + (centerTileCenter.y - tileCenterY) * easedPackProgress;
        const displayCenterX = isCenterTile
          ? centerTileCenter.x
          : thermalState.phase === "resetting"
            ? centerTileCenter.x + (tileCenterX - centerTileCenter.x) * easedResetUnpackProgress
            : packedCenterX;
        const displayCenterY = isCenterTile
          ? centerTileCenter.y
          : thermalState.phase === "resetting"
            ? centerTileCenter.y + (tileCenterY - centerTileCenter.y) * easedResetUnpackProgress
            : packedCenterY;
        const displaySize = tileSize;
        const displayX = displayCenterX - displaySize / 2;
        const displayY = displayCenterY - displaySize / 2;
        const hasOwner = tile.owner >= 0;
        const neutralColor = parseRgb(palette.faint, [162, 163, 159]);
        const accentColor = parseRgb(palette.accent, [78, 218, 122]);
        const color = mixColor(neutralColor, accentColor, tile.visualTint);
        let alpha = tile.visualAlpha;
        if (thermalState.phase === "resetting") {
          alpha *= easedResetUnpackProgress;
        } else if (thermalState.phase === "packing") {
          alpha = isCenterTile
            ? alpha + (1 - alpha) * easedPackProgress
            : alpha * (1 - easedPackProgress);
        }

        context.fillStyle = rgba(color, alpha);
        tilePath(displayX, displayY, displaySize, displaySize, visibleCorner);
        context.fill();

        if (hasOwner && thermalState.phase === "processing") {
          context.save();
          context.globalAlpha = tile.visualTint;
          context.fillStyle = palette.muted;
          context.font = `600 ${palette.metaSize} "IBM Plex Mono", monospace`;
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText(`P${tile.owner + 1}`, displayCenterX, displayCenterY + .2);
          context.restore();
        }

        if (tile.status === "running" && thermalState.phase === "processing") {
          context.save();
          tilePath(displayX, displayY, displaySize, displaySize, visibleCorner);
          context.clip();
          context.fillStyle = rgba(color, 1);
          context.fillRect(displayX, displayY + displaySize - 2, displaySize * Math.min(1, tile.progress), 2);
          context.restore();
        }
      });

      if (thermalState.phase === "resetting") {
        const edgeInset = compact ? 14 : 24;
        const entryStartX = width - edgeInset - tileSize / 2;
        const entryX = centerTileCenter.x
          + (entryStartX - centerTileCenter.x) * (1 - resetEntryProgress * resetEntryProgress);
        const entryAlpha = Math.max(0, Math.min(1, (resetEntryProgress - .2) / .8));
        const sourceAlpha = resetEntryProgress < 1
          ? entryAlpha
          : 1 - easedResetUnpackProgress;
        context.fillStyle = rgba(parseRgb(palette.faint, [162, 163, 159]), sourceAlpha);
        roundedPath(entryX - tileSize / 2, centerTileCenter.y - tileSize / 2, tileSize, tileSize, Math.max(1.5, tileSize * .16));
        context.fill();
      }

      if (thermalState.phase === "sending") {
        const sendProgress = Math.min(1, thermalState.phaseElapsed / 1.05);
        const easedSendProgress = 1 - Math.pow(1 - sendProgress, 2);
        const packageSize = tileSize;
        const edgeInset = compact ? 14 : 24;
        const fadeEndX = width - edgeInset - packageSize / 2;
        const resultX = centerTileCenter.x + (fadeEndX - centerTileCenter.x) * easedSendProgress;
        const resultAlpha = Math.max(0, 1 - sendProgress / .8);
        context.save();
        context.globalAlpha = resultAlpha;
        context.fillStyle = palette.accent;
        roundedPath(resultX - packageSize / 2, centerTileCenter.y - packageSize / 2, packageSize, packageSize, Math.max(1.5, packageSize * .16));
        context.fill();
        context.restore();
      }

      if (pipelineOutput) {
        const result = thermalState.results.pipeline;
        pipelineOutput.textContent = result ? `${Math.round(result.time)} s` : "RUN";
      }
      if (aiOutput) {
        const result = thermalState.results.ai;
        const baseline = thermalState.results.pipeline;
        if (!result) {
          aiOutput.textContent = "RUN";
        } else if (!baseline) {
          aiOutput.textContent = `${Math.round(result.time)} s`;
        } else {
          const gain = (baseline.time - result.time) / baseline.time * 100;
          aiOutput.textContent = `${Math.round(result.time)}s / ${gain >= 0 ? "+" : ""}${Math.round(gain)}%`;
        }
      }
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width < 10 || bounds.height < 10) return;
      const width = Math.round(bounds.width);
      const height = Math.round(bounds.height);
      if (thermalState.width === width && thermalState.height === height) return;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      thermalState.width = width;
      thermalState.height = height;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      draw(performance.now());
    };

    schedulerButtons.forEach((button) => button.addEventListener("click", () => {
      const aiEnabled = button.dataset.schedulerMode === "ai";
      thermalState.aiEnabled = aiEnabled;
      schedulerButtons.forEach((candidate) => {
        candidate.setAttribute("aria-pressed", String(candidate === button));
      });
      beginRound({ animateReset: true });
      draw(performance.now());
    }));

    const formatTemperatureLimit = (value) => Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
    const syncTemperatureLimit = () => {
      if (!temperatureLimitInput) return;
      const minimum = Number(temperatureLimitInput.min);
      const maximum = Number(temperatureLimitInput.max);
      const value = Math.max(minimum, Math.min(maximum, Number(temperatureLimitInput.value)));
      const label = formatTemperatureLimit(value);
      thermalState.aiTemperatureLimit = value;
      temperatureLimitInput.style.setProperty("--limit-position", `${(value - minimum) / (maximum - minimum) * 100}%`);
      if (temperatureLimitOutput) temperatureLimitOutput.textContent = `${label}°C`;
    };

    if (temperatureLimitInput) {
      syncTemperatureLimit();
      temperatureLimitInput.addEventListener("input", () => {
        syncTemperatureLimit();
        thermalState.results.ai = null;
        draw(performance.now());
      });
    }

    const resetThermalDemo = () => {
      thermalState.aiEnabled = false;
      thermalState.aiTemperatureLimit = DEFAULT_AI_TEMPERATURE_LIMIT;
      thermalState.workload = 72;
      thermalState.temperatures = [...INITIAL_TEMPERATURES];
      thermalState.frequencies = Array(6).fill(1000);
      thermalState.results = { pipeline: null, ai: null };
      thermalState.lastTime = performance.now();

      schedulerButtons.forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.schedulerMode === "pipeline"));
      });
      if (temperatureLimitInput) {
        temperatureLimitInput.value = String(DEFAULT_AI_TEMPERATURE_LIMIT);
        syncTemperatureLimit();
      }
      if (pipelineOutput) pipelineOutput.textContent = "RUN";
      if (aiOutput) aiOutput.textContent = "RUN";
      beginRound({ animateReset: true });
      // Replace the previous run's bitmap while the page is still faded out,
      // so returning to Scheduler never exposes one stale canvas frame.
      draw(performance.now());
    };

    readPalette();
    const themeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    themeQuery.addEventListener?.("change", () => {
      readPalette();
      draw(performance.now());
    });
    document.addEventListener("sectionthemechange", () => {
      readPalette();
      draw(performance.now());
    });
    beginRound({ animateReset: true });
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const researchView = demo.closest(".content-view");
    const schedulerPage = demo.closest(".thermal-page-scheduler");
    let schedulerPageVisible = Boolean(schedulerPage?.classList.contains("is-active"));
    let contentFullyEntered = Boolean(
      researchView?.classList.contains("active") && demo.classList.contains("active")
    );
    const demoIsVisible = () => Boolean(
      contentFullyEntered && researchView?.classList.contains("active") &&
      demo.classList.contains("active") && schedulerPageVisible
    );
    let schedulerAnimationReady = false;
    let schedulerStartTimer = 0;
    const cancelSchedulerStart = () => {
      window.clearTimeout(schedulerStartTimer);
      schedulerStartTimer = 0;
      schedulerAnimationReady = false;
    };
    const scheduleSchedulerStart = () => {
      cancelSchedulerStart();
      if (!demoIsVisible()) return;
      schedulerStartTimer = window.setTimeout(() => {
        schedulerStartTimer = 0;
        if (!demoIsVisible()) return;
        schedulerAnimationReady = true;
        thermalState.lastTime = performance.now();
      }, 600);
    };
    let wasDemoVisible = demoIsVisible();
    document.addEventListener("thermalpagechange", (event) => {
      const { outgoing } = event.detail || {};
      cancelSchedulerStart();
      if (outgoing?.classList.contains("thermal-page-scheduler")) resetThermalDemo();
      schedulerPageVisible = false;
      wasDemoVisible = demoIsVisible();
    });
    document.addEventListener("thermalpageentered", (event) => {
      const { incoming } = event.detail || {};
      schedulerPageVisible = Boolean(incoming?.classList.contains("thermal-page-scheduler"));
      thermalState.lastTime = performance.now();
      wasDemoVisible = demoIsVisible();
      scheduleSchedulerStart();
    });
    const markContentEntered = (incoming) => {
      const enteredResearchView = incoming === researchView && demo.classList.contains("active");
      const enteredThermalSection = incoming === demo && researchView?.classList.contains("active");
      if (!enteredResearchView && !enteredThermalSection) return;
      contentFullyEntered = true;
      thermalState.lastTime = performance.now();
      wasDemoVisible = demoIsVisible();
      scheduleSchedulerStart();
    };
    document.addEventListener("viewentered", (event) => markContentEntered(event.detail?.incoming));
    document.addEventListener("sectionentered", (event) => markContentEntered(event.detail?.incoming));
    const visibilityObserver = new MutationObserver(() => {
      if (!researchView?.classList.contains("active") || !demo.classList.contains("active")) {
        contentFullyEntered = false;
        cancelSchedulerStart();
      }
      const isVisible = demoIsVisible();
      if (wasDemoVisible && !isVisible) resetThermalDemo();
      wasDemoVisible = isVisible;
    });
    visibilityObserver.observe(demo, { attributes: true, attributeFilter: ["class"] });
    if (researchView) {
      visibilityObserver.observe(researchView, { attributes: true, attributeFilter: ["class"] });
    }

    const animate = (time) => {
      const deltaTime = Math.min(.05, Math.max(0, (time - thermalState.lastTime) / 1000));
      thermalState.lastTime = time;
      const isVisible = demoIsVisible();
      if (isVisible) {
        if (!reduceMotion && schedulerAnimationReady) updateSimulation(deltaTime);
        draw(time);
      }
      window.requestAnimationFrame(animate);
    };

    window.requestAnimationFrame(animate);
  };

  const initMoeDemo = () => {
    const loop = document.querySelector("[data-moe-loop]");
    if (loop) {
      const controller = loop.querySelector("[data-moe-controller]");
      const status = loop.querySelector("[data-moe-loop-status]");
      const piCpu = loop.querySelector("[data-moe-pi-cpu]");
      const piAssignment = loop.querySelector("[data-moe-pi-assignment]");
      const controllerPrompt = controller?.querySelector(".moe-controller-header strong");
      let timers = [];
      let isRunning = false;

      const clearTimers = () => {
        timers.forEach((timer) => window.clearTimeout(timer));
        timers = [];
      };

      const resetLoop = () => {
        clearTimers();
        isRunning = false;
        loop.classList.remove("processing", "resolved");
        controller?.removeAttribute("aria-busy");
        if (status) status.textContent = "READY · CLICK CONTROLLER";
        if (controllerPrompt) controllerPrompt.textContent = "Click to aggregate";
        if (piCpu) piCpu.textContent = "1 GHz";
        if (piAssignment) piAssignment.textContent = "—";
      };

      const runDecision = () => {
        if (!controller || isRunning) return;
        clearTimers();
        isRunning = true;
        loop.classList.remove("resolved");
        loop.classList.add("processing");
        controller.setAttribute("aria-busy", "true");
        if (status) status.textContent = "AGGREGATING EXPERTS + GATE";
        if (controllerPrompt) controllerPrompt.textContent = "Combining advice…";
        if (piCpu) piCpu.textContent = "1 GHz";
        if (piAssignment) piAssignment.textContent = "—";

        timers.push(window.setTimeout(() => {
          loop.classList.remove("processing");
          loop.classList.add("resolved");
          if (status) status.textContent = "RETURNING DECISION TO PI 4";
          if (controllerPrompt) controllerPrompt.textContent = "Decision ready";
        }, 760));

        timers.push(window.setTimeout(() => {
          if (piCpu) piCpu.textContent = "900 MHz";
          if (piAssignment) piAssignment.textContent = "3 tiles";
          if (status) status.textContent = "PI 4 UPDATED · CLICK TO RUN AGAIN";
          controller.removeAttribute("aria-busy");
          isRunning = false;
        }, 1810));
      };

      controller?.addEventListener("click", runDecision);
      document.addEventListener("thermalpagechange", (event) => {
        if (event.detail?.outgoing?.classList.contains("thermal-page-moe")) resetLoop();
      });
      resetLoop();
      return;
    }

    const stage = document.querySelector("[data-moe-demo]");
    if (!stage) return;

    const signals = [...stage.querySelectorAll("[data-signal]")];
    const experts = [...stage.querySelectorAll("[data-expert]")];
    const scenarioButtons = [...stage.querySelectorAll("[data-moe-scenario]")];
    const status = stage.querySelector("[data-moe-status]");
    const gateFocus = stage.querySelector("[data-gate-focus]");
    const decision = stage.querySelector("[data-moe-decision]");
    const batch = stage.querySelector("[data-moe-batch]");
    const forecast = stage.querySelector("[data-moe-forecast]");

    const profiles = {
      balanced: {
        status: "BALANCED INPUT",
        signals: {
          temperature: ["58°C", .42], slope: ["+0.8°/s", .35], frequency: ["1000 MHz", .92], availability: ["4 / 6", .67],
          queue: ["0", .08], tile: ["72%", .72], power: ["9.2 W", .48], deadline: ["12.0 s", .58]
        },
        weights: { thermal: .28, throughput: .30, balance: .24, prediction: .18 },
        decision: "P1 + P4", batch: "3 + 2 tiles", forecast: "68°C peak · 8.7 s"
      },
      thermal: {
        status: "THERMAL SPIKE",
        signals: {
          temperature: ["79°C", .88], slope: ["+2.6°/s", .92], frequency: ["700 MHz", .48], availability: ["3 / 6", .5],
          queue: ["2", .34], tile: ["64%", .64], power: ["12.8 W", .82], deadline: ["14.0 s", .46]
        },
        weights: { thermal: .52, throughput: .12, balance: .14, prediction: .22 },
        decision: "P2 + P6", batch: "2 + 3 tiles", forecast: "76°C peak · 10.1 s"
      },
      deadline: {
        status: "DEADLINE PRESSURE",
        signals: {
          temperature: ["63°C", .54], slope: ["+1.1°/s", .44], frequency: ["1000 MHz", .92], availability: ["5 / 6", .84],
          queue: ["1", .2], tile: ["91%", .91], power: ["10.6 W", .62], deadline: ["6.0 s", .94]
        },
        weights: { thermal: .14, throughput: .48, balance: .24, prediction: .14 },
        decision: "P1 + P3 + P5", batch: "4 + 3 + 3 tiles", forecast: "72°C peak · 5.6 s"
      }
    };

    const updateProfile = (name) => {
      const profile = profiles[name];
      if (!profile) return;
      scenarioButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.moeScenario === name)));
      signals.forEach((signal) => {
        const [value, level] = profile.signals[signal.dataset.signal];
        signal.querySelector("[data-signal-value]").textContent = value;
        signal.style.setProperty("--signal", `${level * 100}%`);
      });

      const topExpert = Object.entries(profile.weights).sort((left, right) => right[1] - left[1])[0][0];
      experts.forEach((expert) => {
        const weight = profile.weights[expert.dataset.expert];
        expert.style.setProperty("--weight", `${weight * 100}%`);
        expert.querySelector("[data-expert-weight]").textContent = `${Math.round(weight * 100)}%`;
        expert.classList.toggle("top-expert", expert.dataset.expert === topExpert);
      });

      status.textContent = profile.status;
      gateFocus.textContent = topExpert.toUpperCase();
      decision.textContent = profile.decision;
      batch.textContent = profile.batch;
      forecast.textContent = profile.forecast;

      stage.classList.remove("routing");
      void stage.offsetWidth;
      stage.classList.add("routing");
      window.setTimeout(() => stage.classList.remove("routing"), 760);
    };

    const showSignalLinks = (signal) => {
      const linked = new Set(signal.dataset.experts.split(" "));
      stage.classList.add("filtering");
      experts.forEach((expert) => expert.classList.toggle("signal-match", linked.has(expert.dataset.expert)));
    };

    const clearSignalLinks = () => {
      stage.classList.remove("filtering");
      experts.forEach((expert) => expert.classList.remove("signal-match"));
    };

    signals.forEach((signal) => {
      signal.addEventListener("mouseenter", () => showSignalLinks(signal));
      signal.addEventListener("mouseleave", clearSignalLinks);
      signal.addEventListener("focus", () => showSignalLinks(signal));
      signal.addEventListener("blur", clearSignalLinks);
    });
    const resetMoeDemo = () => {
      clearSignalLinks();
      updateProfile("balanced");
    };

    scenarioButtons.forEach((button) => button.addEventListener("click", () => updateProfile(button.dataset.moeScenario)));
    resetMoeDemo();
    document.addEventListener("thermalpagechange", (event) => {
      if (event.detail?.outgoing?.classList.contains("thermal-page-moe")) resetMoeDemo();
    });

    const researchView = stage.closest(".content-view");
    let wasResearchViewActive = Boolean(researchView?.classList.contains("active"));
    if (researchView) {
      const visibilityObserver = new MutationObserver(() => {
        const isResearchViewActive = researchView.classList.contains("active");
        if (wasResearchViewActive && !isResearchViewActive) resetMoeDemo();
        wasResearchViewActive = isResearchViewActive;
      });
      visibilityObserver.observe(researchView, { attributes: true, attributeFilter: ["class"] });
    }
  };

  const initMoeRouting = () => {
    const stage = document.querySelector("[data-moe-routing-stage]");
    if (!stage) return;

    const svg = stage.querySelector("[data-moe-routing-lines]");
    const source = stage.querySelector("[data-moe-routing-source]");
    const expertsRoutes = stage.querySelector("[data-moe-experts-routes]");
    const gatingRoutes = stage.querySelector("[data-moe-gating-routes]");
    const expertResultRoutes = stage.querySelector("[data-moe-expert-result-routes]");
    const gatingResultRoutes = stage.querySelector("[data-moe-gating-result-routes]");
    const contributionMergeRoutes = stage.querySelector("[data-moe-contribution-merge-routes]");
    const mergedResultRoute = stage.querySelector("[data-moe-merged-result-route]");
    const resultPiRoute = stage.querySelector("[data-moe-result-pi-route]");
    const expertsTarget = stage.querySelector("[data-moe-experts-target]");
    const gatingTarget = stage.querySelector("[data-moe-gating-target]");
    const piTarget = stage.querySelector("[data-moe-pi-target]");
    const expertsSource = stage.querySelector("[data-moe-experts-source]");
    const gatingSource = stage.querySelector("[data-moe-gating-source]");
    const resultsTarget = stage.querySelector("[data-moe-results-target]");
    const finalTarget = stage.querySelector("[data-moe-final-target]");
    const finalSource = stage.querySelector("[data-moe-final-source]");
    if (!svg || !source || !expertsRoutes || !gatingRoutes || !expertResultRoutes || !gatingResultRoutes || !contributionMergeRoutes || !mergedResultRoute || !resultPiRoute || !expertsTarget || !gatingTarget || !piTarget || !expertsSource || !gatingSource || !resultsTarget || !finalTarget || !finalSource) return;

    const drawRouting = () => {
      const stageRect = stage.getBoundingClientRect();
      const layers = [...source.querySelectorAll(".moe-pi-device")];
      const expertLayers = [...expertsSource.querySelectorAll(".moe-pi-device")];
      const resultLayers = [...resultsTarget.querySelectorAll(".moe-pi-device")];
      if (!stageRect.width || !stageRect.height || !layers.length || !expertLayers.length || !resultLayers.length) return;

      const layerRects = layers.map((layer) => layer.getBoundingClientRect());
      const expertLayerRects = expertLayers.map((layer) => layer.getBoundingClientRect());
      const resultLayerRects = resultLayers.map((layer) => layer.getBoundingClientRect());
      const expertsRect = expertsTarget.getBoundingClientRect();
      const gatingRect = gatingTarget.getBoundingClientRect();
      const piTargetRect = piTarget.getBoundingClientRect();
      const gatingSourceRect = gatingSource.getBoundingClientRect();
      const finalTargetRect = finalTarget.getBoundingClientRect();
      const finalSourceRect = finalSource.getBoundingClientRect();
      const sourceX = layerRects[0].right - stageRect.left;
      const sourceYs = layerRects.map((rect) => rect.top + rect.height / 2 - stageRect.top);
      const expertsX = expertsRect.left - stageRect.left - 6;
      const expertsY = expertsRect.top + expertsRect.height / 2 - stageRect.top;
      const gatingX = gatingRect.left - stageRect.left - 6;
      const gatingY = gatingRect.top + gatingRect.height / 2 - stageRect.top;
      const clean = (value) => Math.round(value * 10) / 10;
      const curvePath = (startX, startY, endX, endY, controlY = endY, controlX = endX + (startX - endX) * .52, controlX2, controlY2) => {
        if (Number.isFinite(controlX2) && Number.isFinite(controlY2)) {
          return `M${clean(startX)} ${clean(startY)}C${clean(controlX)} ${clean(controlY)} ${clean(controlX2)} ${clean(controlY2)} ${clean(endX)} ${clean(endY)}`;
        }
        return `M${clean(startX)} ${clean(startY)}Q${clean(controlX)} ${clean(controlY)} ${clean(endX)} ${clean(endY)}`;
      };
      const renderRoutes = (group, routeData) => {
        const routes = routeData.map(({ d, startX, startY, endX, endY, controlY, controlX, controlX2, controlY2 }) => {
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("d", d || curvePath(startX, startY, endX, endY, controlY, controlX, controlX2, controlY2));
          return path;
        });
        group.replaceChildren(...routes);
      };

      svg.setAttribute("viewBox", `0 0 ${clean(stageRect.width)} ${clean(stageRect.height)}`);
      renderRoutes(expertsRoutes, sourceYs.map((startY) => ({
        startX: sourceX,
        startY,
        endX: expertsX,
        endY: expertsY,
        controlY: expertsY
      })));
      renderRoutes(gatingRoutes, sourceYs.map((startY) => ({
        startX: sourceX,
        startY,
        endX: gatingX,
        endY: gatingY,
        controlY: gatingY
      })));

      const mappedLayerCount = Math.min(expertLayerRects.length, resultLayerRects.length);
      renderRoutes(expertResultRoutes, Array.from({ length: mappedLayerCount }, (_, index) => {
        const expertRect = expertLayerRects[index];
        const resultRect = resultLayerRects[index];
        const startX = expertRect.right - stageRect.left;
        const startY = expertRect.top + expertRect.height / 2 - stageRect.top;
        const endX = resultRect.left - stageRect.left;
        const endY = resultRect.top + resultRect.height / 2 - stageRect.top;
        const curveOffset = (index - (mappedLayerCount - 1) / 2) * 2.2;
        return { startX, startY, endX, endY, controlY: (startY + endY) / 2 + curveOffset };
      }));

      const gatingSourceX = gatingSourceRect.right - stageRect.left;
      const gatingSourceY = gatingSourceRect.top + gatingSourceRect.height / 2 - stageRect.top;
      renderRoutes(gatingResultRoutes, resultLayerRects.map((resultRect) => {
        const endX = resultRect.left - stageRect.left;
        const endY = resultRect.top + resultRect.height / 2 - stageRect.top;
        return { startX: gatingSourceX, startY: gatingSourceY, endX, endY, controlY: endY };
      }));

      const finalTargetX = finalTargetRect.right - stageRect.left + 12;
      const finalTargetY = finalTargetRect.top + finalTargetRect.height / 2 - stageRect.top;
      const contributionRight = Math.max(...resultLayerRects.map((rect) => rect.right - stageRect.left));
      const routingRight = stageRect.width - 8;
      const rightSpace = Math.max(1, routingRight - contributionRight);
      const bottomRect = resultLayerRects.at(-1);
      const mainStart = {
        x: bottomRect.right - stageRect.left,
        y: bottomRect.top + bottomRect.height / 2 - stageRect.top
      };
      const mainControl1 = { x: routingRight, y: mainStart.y };
      const mainControl2 = { x: routingRight + 8, y: finalTargetY + 2 };
      const mainEnd = { x: finalTargetX, y: finalTargetY };
      const lerpPoint = (start, end, progress) => ({
        x: start.x + (end.x - start.x) * progress,
        y: start.y + (end.y - start.y) * progress
      });
      const mergeProgress = .58;
      const splitA = lerpPoint(mainStart, mainControl1, mergeProgress);
      const splitB = lerpPoint(mainControl1, mainControl2, mergeProgress);
      const splitC = lerpPoint(mainControl2, mainEnd, mergeProgress);
      const splitD = lerpPoint(splitA, splitB, mergeProgress);
      const splitE = lerpPoint(splitB, splitC, mergeProgress);
      const mergePoint = lerpPoint(splitD, splitE, mergeProgress);
      const outgoingX = splitE.x - mergePoint.x;
      const outgoingY = splitE.y - mergePoint.y;
      const outgoingMagnitude = Math.hypot(outgoingX, outgoingY) || 1;
      renderRoutes(contributionMergeRoutes, resultLayerRects.map((resultRect, index) => {
        const startX = resultRect.right - stageRect.left;
        const startY = resultRect.top + resultRect.height / 2 - stageRect.top;
        const layerProgress = resultLayerRects.length > 1 ? index / (resultLayerRects.length - 1) : 0;
        const control1X = contributionRight + rightSpace * (1 - layerProgress * .58);
        const incomingHandle = rightSpace * (.54 - layerProgress * .24);
        const control2X = mergePoint.x - outgoingX / outgoingMagnitude * incomingHandle;
        const control2Y = mergePoint.y - outgoingY / outgoingMagnitude * incomingHandle;
        return {
          d: `M${clean(startX)} ${clean(startY)}C${clean(control1X)} ${clean(startY)} ${clean(control2X)} ${clean(control2Y)} ${clean(mergePoint.x)} ${clean(mergePoint.y)}`
        };
      }));
      renderRoutes(mergedResultRoute, [{
        d: `M${clean(mergePoint.x)} ${clean(mergePoint.y)}C${clean(splitE.x)} ${clean(splitE.y)} ${clean(splitC.x)} ${clean(splitC.y)} ${clean(mainEnd.x)} ${clean(mainEnd.y)}`
      }]);

      const piTargetX = piTargetRect.left - stageRect.left - 12;
      const piTargetY = piTargetRect.top + piTargetRect.height / 2 - stageRect.top;
      const finalSourceX = finalSourceRect.left - stageRect.left;
      const finalSourceY = finalSourceRect.top + finalSourceRect.height / 2 - stageRect.top;
      const resultOuterX = Math.max(4, (piTargetRect.left - stageRect.left) * .12);
      renderRoutes(resultPiRoute, [{
        d: `M${clean(finalSourceX)} ${clean(finalSourceY)}C${clean(resultOuterX)} ${clean(finalSourceY)} ${clean(resultOuterX)} ${clean(piTargetY)} ${clean(piTargetX)} ${clean(piTargetY)}`
      }]);
    };

    const routingObserver = new ResizeObserver(drawRouting);
    routingObserver.observe(stage);
    routingObserver.observe(source);
    routingObserver.observe(expertsSource);
    routingObserver.observe(resultsTarget);
    routingObserver.observe(finalSource);
    document.fonts?.ready.then(drawRouting);
    document.addEventListener("thermalpageentered", drawRouting);
    drawRouting();
  };

  const initMoeAnimation = () => {
    const stage = document.querySelector("[data-moe-routing-stage]");
    if (!stage) return;

    const moePage = stage.closest(".thermal-page-moe");
    const thermalDemo = stage.closest("[data-thermal-demo]");
    const researchView = stage.closest(".content-view");
    const piLayers = [...stage.querySelectorAll("[data-moe-routing-source] .moe-pi-device")];
    const expertLayers = [...stage.querySelectorAll("[data-moe-experts-source] .moe-pi-device")];
    const gatingLayer = stage.querySelector("[data-moe-gating-source]");
    const contributionLayers = [...stage.querySelectorAll("[data-moe-results-target] .moe-pi-device")];
    const finalLayer = stage.querySelector("[data-moe-final-source]");
    const piTitle = stage.querySelector("[data-moe-pi-target]");
    const expertsTitle = stage.querySelector("[data-moe-experts-target]");
    const gatingTitle = stage.querySelector("[data-moe-gating-target]");
    const resultsTitle = stage.querySelector("[data-moe-final-target]");
    const piStack = stage.querySelector("[data-moe-routing-source]");
    const expertsStack = stage.querySelector("[data-moe-experts-source]");
    const gatingStack = gatingLayer?.closest(".moe-pi-stack");
    const contributionsStack = stage.querySelector("[data-moe-results-target]");
    const resultsStack = finalLayer?.closest(".moe-pi-stack");
    const routeGroups = {
      piToModel: [stage.querySelector("[data-moe-experts-routes]"), stage.querySelector("[data-moe-gating-routes]")],
      modelToContributions: [stage.querySelector("[data-moe-expert-result-routes]"), stage.querySelector("[data-moe-gating-result-routes]")],
      contributionsToMerge: [stage.querySelector("[data-moe-contribution-merge-routes]")],
      mergeToResult: [stage.querySelector("[data-moe-merged-result-route]")],
      resultToPi: [stage.querySelector("[data-moe-result-pi-route]")]
    };
    if (!moePage || !thermalDemo || !researchView || !piLayers.length || !expertLayers.length || !gatingLayer || !contributionLayers.length || !finalLayer || !piTitle || !expertsTitle || !gatingTitle || !resultsTitle || !piStack || !expertsStack || !gatingStack || !contributionsStack || !resultsStack || Object.values(routeGroups).flat().some((group) => !group)) return;

    let runToken = 0;
    let running = false;
    const ROUTE_FADE_DURATION = 240;
    const activeAnimations = new Set();
    const delay = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));
    const isVisible = () => moePage.classList.contains("is-active") && thermalDemo.classList.contains("active") && researchView.classList.contains("active");
    const focusableStacks = [piStack, expertsStack, gatingStack, contributionsStack, resultsStack];
    const focusStacks = (activeStacks = []) => {
      const active = new Set(activeStacks.filter(Boolean));
      focusableStacks.forEach((stack) => stack.classList.toggle("is-moe-muted", active.size > 0 && !active.has(stack)));
    };
    const dimAllStacks = () => focusableStacks.forEach((stack) => stack.classList.add("is-moe-muted"));
    const prepareTransmission = async (stacks, token) => {
      focusStacks(stacks);
      await delay(600);
      return token === runToken && isVisible();
    };

    const resetVisuals = () => {
      activeAnimations.forEach((animation) => animation.cancel());
      activeAnimations.clear();
      stage.querySelectorAll(".is-pulsing").forEach((layer) => {
        layer.classList.remove("is-pulsing");
        layer.style.removeProperty("--moe-pulse-duration");
      });
      stage.querySelectorAll(".is-title-pulsing").forEach((title) => {
        title.classList.remove("is-title-pulsing");
        title.style.removeProperty("--moe-title-pulse-duration");
      });
      dimAllStacks();
      stage.classList.add("is-resetting");
      contributionLayers.forEach((layer) => layer.classList.remove("is-filled"));
      stage.querySelectorAll(".moe-route-packet").forEach((packet) => packet.remove());
      stage.querySelectorAll(".moe-routing-lines path").forEach((path) => {
        path.style.removeProperty("stroke-dasharray");
        path.style.removeProperty("stroke-dashoffset");
        path.style.removeProperty("opacity");
      });
      void stage.offsetWidth;
      stage.classList.remove("is-resetting");
    };

    const animateSourceLayers = (layers, riseDuration, travelDuration, fadeDuration) => {
      const layerDuration = riseDuration + travelDuration + fadeDuration;
      const layerArrivalOffset = (riseDuration + travelDuration) / layerDuration;
      const baseBorder = "rgb(from var(--accent) r g b / var(--accent-base-strength))";
      const activeBorder = "rgb(from var(--accent) r g b / var(--moe-highlight-border-strength))";
      const baseBackground = "rgb(from var(--accent) r g b / var(--accent-subtle-strength))";
      const activeBackground = "rgb(from var(--accent) r g b / var(--moe-highlight-fill-strength))";

      return [...new Set(layers.filter(Boolean))].map((layer) => {
        const animation = layer.animate([
          { borderColor: baseBorder, backgroundColor: baseBackground, offset: 0 },
          { borderColor: activeBorder, backgroundColor: activeBackground, offset: riseDuration / layerDuration },
          { borderColor: activeBorder, backgroundColor: activeBackground, offset: layerArrivalOffset },
          { borderColor: baseBorder, backgroundColor: baseBackground, offset: 1 }
        ], { duration: layerDuration, easing: "linear", fill: "forwards" });
        activeAnimations.add(animation);
        return animation;
      });
    };

    const clearAnimations = (animations) => {
      animations.forEach((animation) => {
        activeAnimations.delete(animation);
        animation.cancel();
      });
    };

    const runArrivalFeedback = async (onArrival, travelDuration, token) => {
      await delay(travelDuration);
      if (token !== runToken || !isVisible()) return false;
      if (typeof onArrival !== "function") return true;
      const result = await onArrival();
      return Array.isArray(result) ? result.every(Boolean) : result !== false;
    };

    const transmitPathsFromLayers = async (
      paths,
      layers,
      token,
      { riseDuration = 260, travelDuration = 900, fadeDuration = ROUTE_FADE_DURATION, packetScale = 1, onArrival = null } = {}
    ) => {
      if (token !== runToken || !isVisible()) return false;
      if (!paths.length || !layers.length) return false;

      const layerAnimations = animateSourceLayers(layers, riseDuration, travelDuration, fadeDuration);

      await delay(riseDuration);
      if (token !== runToken || !isVisible()) {
        clearAnimations(layerAnimations);
        return false;
      }

      const routeDuration = travelDuration + fadeDuration;
      const fadeInOffset = ROUTE_FADE_DURATION / routeDuration;
      const arrivalOffset = travelDuration / routeDuration;
      const transmissions = paths.map((path) => {
        const length = Math.max(1, path.getTotalLength());
        const firstPoint = path.getPointAtLength(0);
        const lastPoint = path.getPointAtLength(length);
        const packet = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        packet.classList.add("moe-route-packet");
        const packetRadius = (stage.getBoundingClientRect().width < 430 ? 2.4 : 3) * packetScale;
        packet.setAttribute("r", `${packetRadius}`);
        packet.setAttribute("cx", "0");
        packet.setAttribute("cy", "0");
        path.parentElement.appendChild(packet);

        const lineAnimation = path.animate([
          { opacity: 0, offset: 0 },
          { opacity: 1, offset: fadeInOffset },
          { opacity: 1, offset: arrivalOffset },
          { opacity: 0, offset: 1 }
        ], { duration: routeDuration, easing: "linear", fill: "forwards" });

        const packetFrames = Array.from({ length: 37 }, (_, index) => {
          const progress = index / 36;
          const point = path.getPointAtLength(length * progress);
          return {
            opacity: 1,
            transform: `translate(${point.x}px, ${point.y}px)`,
            offset: fadeInOffset + progress * (arrivalOffset - fadeInOffset)
          };
        });
        packetFrames.unshift(
          { opacity: 0, transform: `translate(${firstPoint.x}px, ${firstPoint.y}px)`, offset: 0 },
          { opacity: 0, transform: `translate(${firstPoint.x}px, ${firstPoint.y}px)`, offset: fadeInOffset }
        );
        packetFrames.push(
          { opacity: 1, transform: `translate(${lastPoint.x}px, ${lastPoint.y}px)`, offset: arrivalOffset },
          { opacity: 0, transform: `translate(${lastPoint.x}px, ${lastPoint.y}px)`, offset: 1 }
        );
        const packetAnimation = packet.animate(packetFrames, { duration: routeDuration, easing: "linear", fill: "forwards" });

        activeAnimations.add(lineAnimation);
        activeAnimations.add(packetAnimation);
        return { lineAnimation, packetAnimation, packet };
      });

      const [animationResults, arrivalFeedbackCompleted] = await Promise.all([
        Promise.allSettled([
          ...layerAnimations.map((animation) => animation.finished),
          ...transmissions.flatMap(({ lineAnimation, packetAnimation }) => [lineAnimation.finished, packetAnimation.finished])
        ]),
        runArrivalFeedback(onArrival, travelDuration, token)
      ]);
      void animationResults;
      clearAnimations(layerAnimations);
      transmissions.forEach(({ lineAnimation, packetAnimation, packet }) => {
        activeAnimations.delete(lineAnimation);
        activeAnimations.delete(packetAnimation);
        lineAnimation.cancel();
        packetAnimation.cancel();
        packet.remove();
      });
      return arrivalFeedbackCompleted && token === runToken && isVisible();
    };

    const transmitFromLayers = (groups, layers, token, options) => transmitPathsFromLayers(
      groups.flatMap((group) => [...group.querySelectorAll("path")]),
      layers,
      token,
      options
    );

    const transmitMergedFlow = async (
      branchGroup,
      trunkGroup,
      sourceLayers,
      token,
      { riseDuration = 260, travelDuration = 1800, fadeDuration = ROUTE_FADE_DURATION, onArrival = null } = {}
    ) => {
      if (token !== runToken || !isVisible()) return false;
      const branches = [...branchGroup.querySelectorAll("path")];
      const trunk = trunkGroup.querySelector("path");
      if (!branches.length || !trunk || !sourceLayers.length) return false;

      const layerAnimations = animateSourceLayers(sourceLayers, riseDuration, travelDuration, fadeDuration);
      await delay(riseDuration);
      if (token !== runToken || !isVisible()) {
        clearAnimations(layerAnimations);
        return false;
      }

      const routeDuration = travelDuration + fadeDuration;
      const fadeInOffset = ROUTE_FADE_DURATION / routeDuration;
      const arrivalOffset = travelDuration / routeDuration;

      const lineAnimations = [...branches, trunk].map((path) => {
        const animation = path.animate([
          { opacity: 0, offset: 0 },
          { opacity: 1, offset: fadeInOffset },
          { opacity: 1, offset: arrivalOffset },
          { opacity: 0, offset: 1 }
        ], { duration: routeDuration, easing: "linear", fill: "forwards" });
        activeAnimations.add(animation);
        return animation;
      });

      const trunkLength = Math.max(1, trunk.getTotalLength());
      const pointOnSegments = (segments, progress) => {
        const total = Math.max(1, segments.reduce((sum, segment) => sum + segment.length, 0));
        let distance = total * progress;
        for (const segment of segments) {
          if (distance <= segment.length) return segment.path.getPointAtLength(segment.start + distance);
          distance -= segment.length;
        }
        const last = segments.at(-1);
        return last.path.getPointAtLength(last.end);
      };
      const routes = branches.map((branch) => {
        const branchLength = Math.max(1, branch.getTotalLength());
        return { approach: [{ path: branch, start: 0, end: branchLength, length: branchLength }] };
      });
      const longestRouteLength = Math.max(...routes.map(({ approach }) => (
        approach[0].length + trunkLength
      )));
      const travelOffsetSpan = Math.max(.001, arrivalOffset - fadeInOffset);
      const distancePerOffset = longestRouteLength / travelOffsetSpan;
      const mergeOffset = arrivalOffset - trunkLength / distancePerOffset;
      const mergePoint = trunk.getPointAtLength(0);
      const lastPoint = trunk.getPointAtLength(trunkLength);
      const sharedTailLength = trunkLength;
      const packetRecords = routes.map(({ approach }, routeIndex) => {
        const firstSegment = approach[0];
        const firstPoint = firstSegment.path.getPointAtLength(firstSegment.start);
        const routeStartOffset = arrivalOffset - (firstSegment.length + trunkLength) / distancePerOffset;
        const packet = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        packet.classList.add("moe-route-packet");
        packet.setAttribute("r", stage.getBoundingClientRect().width < 430 ? "2.4" : "3");
        packet.setAttribute("cx", "0");
        packet.setAttribute("cy", "0");
        (branches[routeIndex]?.parentElement ?? trunk.parentElement).appendChild(packet);

        const approachFrames = Array.from({ length: 45 }, (_, index) => {
          const progress = index / 44;
          const point = pointOnSegments(approach, progress);
          return {
            opacity: 1,
            transform: `translate(${point.x}px, ${point.y}px) scale(1)`,
            offset: routeStartOffset + progress * (mergeOffset - routeStartOffset)
          };
        });
        const sharedFrames = Array.from({ length: 49 }, (_, index) => {
          const progress = index / 48;
          const point = trunk.getPointAtLength(sharedTailLength * progress);
          const mergeGrowth = progress < .3
            ? Math.sin((progress / .3) * Math.PI / 2)
            : 1;
          return {
            opacity: 1,
            transform: `translate(${point.x}px, ${point.y}px) scale(${1 + mergeGrowth * 1.6})`,
            offset: mergeOffset + progress * (arrivalOffset - mergeOffset)
          };
        });
        const frames = [
          { opacity: 0, transform: `translate(${firstPoint.x}px, ${firstPoint.y}px) scale(1)`, offset: 0 },
          { opacity: 0, transform: `translate(${firstPoint.x}px, ${firstPoint.y}px) scale(1)`, offset: routeStartOffset },
          ...approachFrames,
          { opacity: 1, transform: `translate(${mergePoint.x}px, ${mergePoint.y}px) scale(1)`, offset: mergeOffset },
          ...sharedFrames,
          { opacity: 1, transform: `translate(${lastPoint.x}px, ${lastPoint.y}px) scale(2.6)`, offset: arrivalOffset },
          { opacity: 0, transform: `translate(${lastPoint.x}px, ${lastPoint.y}px) scale(2.6)`, offset: 1 }
        ];
        const animation = packet.animate(frames, { duration: routeDuration, easing: "linear", fill: "forwards" });
        activeAnimations.add(animation);
        return { packet, animation };
      });

      const [animationResults, arrivalFeedbackCompleted] = await Promise.all([
        Promise.allSettled([
          ...layerAnimations.map((animation) => animation.finished),
          ...lineAnimations.map((animation) => animation.finished),
          ...packetRecords.map(({ animation }) => animation.finished)
        ]),
        runArrivalFeedback(onArrival, travelDuration, token)
      ]);
      void animationResults;
      clearAnimations([...layerAnimations, ...lineAnimations]);
      packetRecords.forEach(({ packet, animation }) => {
        activeAnimations.delete(animation);
        animation.cancel();
        packet.remove();
      });
      return arrivalFeedbackCompleted && token === runToken && isVisible();
    };

    const pulseLayer = async (layer, duration, token, fill = false) => {
      if (token !== runToken || !isVisible()) return false;
      if (fill) layer.classList.add("is-filled");
      layer.classList.remove("is-pulsing");
      layer.style.setProperty("--moe-pulse-duration", `${duration}ms`);
      void layer.offsetWidth;
      layer.classList.add("is-pulsing");
      await delay(duration);
      if (token !== runToken) return false;
      layer.classList.remove("is-pulsing");
      layer.style.removeProperty("--moe-pulse-duration");
      return isVisible();
    };

    const pulseTitle = async (title, duration, token) => {
      if (token !== runToken || !isVisible()) return false;
      title.classList.remove("is-title-pulsing");
      title.style.setProperty("--moe-title-pulse-duration", `${duration}ms`);
      void title.offsetWidth;
      title.classList.add("is-title-pulsing");
      await delay(duration);
      if (token !== runToken) return false;
      title.classList.remove("is-title-pulsing");
      title.style.removeProperty("--moe-title-pulse-duration");
      return isVisible();
    };

    const playSequence = async (token) => {
      while (token === runToken && isVisible()) {
        if (!await prepareTransmission([piStack, expertsStack, gatingStack], token)) break;
        if (!await transmitFromLayers(routeGroups.piToModel, piLayers, token, {
          onArrival: () => Promise.all([
            pulseTitle(expertsTitle, 400, token),
            pulseTitle(gatingTitle, 400, token)
          ])
        })) break;
        await delay(120);

        const expertContributionPaths = [...routeGroups.modelToContributions[0].querySelectorAll("path")];
        const gatingContributionPaths = [...routeGroups.modelToContributions[1].querySelectorAll("path")];
        if (!await prepareTransmission([expertsStack, gatingStack, contributionsStack], token)) break;
        const contributionStagger = 120;
        const contributionTravelDuration = 620;
        const gatingSendAnimations = animateSourceLayers(
          [gatingLayer],
          180,
          contributionTravelDuration + Math.max(0, contributionLayers.length - 1) * contributionStagger,
          ROUTE_FADE_DURATION
        );
        const gatingSendFinished = Promise.allSettled(
          gatingSendAnimations.map((animation) => animation.finished)
        ).then(() => {
          clearAnimations(gatingSendAnimations);
          return token === runToken && isVisible();
        });
        const contributionWave = contributionLayers.map((layer, index) => (async () => {
          if (index) await delay(index * contributionStagger);
          const paths = [expertContributionPaths[index], gatingContributionPaths[index]].filter(Boolean);
          if (!await transmitPathsFromLayers(paths, [expertLayers[index]], token, {
            riseDuration: 180,
            travelDuration: contributionTravelDuration,
            fadeDuration: ROUTE_FADE_DURATION
          })) return false;
          return pulseLayer(layer, 460, token, layer.classList.contains("moe-weighted-layer"));
        })());
        const [gatingSendCompleted, contributionWaveCompleted] = await Promise.all([
          gatingSendFinished,
          Promise.all(contributionWave)
        ]);
        if (!gatingSendCompleted || !contributionWaveCompleted.every(Boolean)) break;
        await delay(120);

        if (!await prepareTransmission([contributionsStack, resultsStack], token)) break;
        if (!await transmitMergedFlow(
          routeGroups.contributionsToMerge[0],
          routeGroups.mergeToResult[0],
          contributionLayers,
          token,
          { onArrival: () => pulseTitle(resultsTitle, 420, token) }
        )) break;
        contributionLayers.forEach((layer) => layer.classList.remove("is-filled"));
        await delay(120);
        if (!await prepareTransmission([resultsStack, piStack], token)) break;
        if (!await transmitFromLayers(routeGroups.resultToPi, [finalLayer], token, {
          riseDuration: 220,
          travelDuration: 950,
          fadeDuration: ROUTE_FADE_DURATION,
          packetScale: 2.6,
          onArrival: () => pulseTitle(piTitle, 420, token)
        })) break;

        dimAllStacks();
        await delay(1400);
        if (token !== runToken || !isVisible()) break;
        resetVisuals();
        await delay(480);
      }
      if (token === runToken) running = false;
    };

    const stop = () => {
      runToken += 1;
      running = false;
      resetVisuals();
    };

    const start = async () => {
      if (running || !isVisible()) return;
      resetVisuals();
      if (reduceMotion) {
        contributionLayers.forEach((layer) => {
          if (layer.classList.contains("moe-weighted-layer")) layer.classList.add("is-filled");
        });
        return;
      }
      running = true;
      const token = ++runToken;
      await delay(600);
      if (token !== runToken || !isVisible()) {
        if (token === runToken) running = false;
        return;
      }
      playSequence(token);
    };

    document.addEventListener("thermalpagechange", (event) => {
      const { outgoing, incoming } = event.detail || {};
      if (outgoing === moePage) stop();
      if (incoming === moePage) resetVisuals();
    });
    document.addEventListener("thermalpageentered", (event) => {
      if (event.detail?.incoming === moePage) start();
    });
    document.addEventListener("viewentered", (event) => {
      if (event.detail?.incoming === researchView) start();
    });
    document.addEventListener("sectionentered", (event) => {
      if (event.detail?.incoming === thermalDemo) start();
    });

    const visibilityObserver = new MutationObserver(() => {
      if (!isVisible()) stop();
    });
    visibilityObserver.observe(researchView, { attributes: true, attributeFilter: ["class"] });
    visibilityObserver.observe(thermalDemo, { attributes: true, attributeFilter: ["class"] });
    resetVisuals();
  };

  const initMusicMixer = () => {
    const mixer = document.querySelector("[data-music-mixer]");
    const transport = document.querySelector("[data-music-transport]");
    if (!mixer || !transport) return;

    const musicView = mixer.closest("[data-view='music']");
    const playButton = transport.querySelector("[data-music-play]");
    const openTrackButton = transport.querySelector("[data-music-open]");
    const progress = transport.querySelector("[data-music-progress]");
    const progressVisual = transport.querySelector("[data-music-progress-visual]");
    const progressFill = transport.querySelector("[data-music-progress-fill]");
    const progressThumb = transport.querySelector("[data-music-progress-thumb]");
    const currentOutput = transport.querySelector("[data-music-current]");
    const durationState = transport.querySelector("[data-music-duration-state]");
    const durationOutput = transport.querySelector("[data-music-duration]");
    const trackList = mixer.querySelector("[data-music-track-list]");
    if (!musicView || !playButton || !openTrackButton || !progress || !progressVisual || !progressFill || !progressThumb || !currentOutput || !durationState || !durationOutput || !trackList) return;

    const openMusicReworks = () => {
      const musicTab = document.querySelector('[data-view-target="music"]');
      const reworksLink = document.querySelector('[data-page-nav="music"] a[href="#music-reworks"]');
      if (!musicTab || !reworksLink) return;
      if (musicView.classList.contains("active")) {
        reworksLink.click();
        return;
      }
      window.history.pushState({ view: "music" }, "", "#music-reworks");
      activateView("music", false);
    };
    openTrackButton.addEventListener("click", openMusicReworks);

    const trackTitle = (track) => track?.folder || "";
    const musicTracks = Array.isArray(window.MUSIC_LIBRARY)
      ? window.MUSIC_LIBRARY.filter((track) => (
        track && typeof track.folder === "string" && track.folder.length > 0 && Array.isArray(track.files)
      ))
      : [];
    const trackItems = musicTracks.map((track) => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = trackTitle(track);
      item.dataset.musicFolder = track.folder;
      item.setAttribute("role", "button");
      item.setAttribute("tabindex", "0");
      item.append(label);
      return item;
    });
    trackList.replaceChildren(...trackItems);

    const orchestra = mixer.querySelector("[data-music-orchestra]");
    const orchestraStage = orchestra?.querySelector("[data-orchestra-stage]");
    const allOnControl = orchestra?.querySelector("[data-music-all-on]");
    const allOffControl = orchestra?.querySelector("[data-music-all-off]");
    if (!orchestraStage || !allOnControl || !allOffControl) return;
    const appleWebKitVisual = /AppleWebKit/i.test(navigator.userAgent)
      && !/(Chrome|Chromium|CriOS|Edg|EdgiOS|OPR|FxiOS)/i.test(navigator.userAgent);
    mixer.classList.toggle("is-apple-webkit", appleWebKitVisual);
    const getSeatHull = (points) => {
      const sorted = [...points]
        .sort((a, b) => a.x - b.x || a.y - b.y)
        .filter((point, index, list) => index === 0 || point.x !== list[index - 1].x || point.y !== list[index - 1].y);
      if (sorted.length <= 2) return sorted;
      const cross = (origin, a, b) => (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
      const lower = [];
      sorted.forEach((point) => {
        while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
        lower.push(point);
      });
      const upper = [];
      [...sorted].reverse().forEach((point) => {
        while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
        upper.push(point);
      });
      return lower.slice(0, -1).concat(upper.slice(0, -1));
    };
    const orchestraSections = [
      { name: "Female Choir", count: 8, centerX: 465, centerY: 110, radius: 0, layout: "line", lineStartX: 290, lineEndX: 640, lineY: 110, startAngle: 0, endAngle: 0, color: "var(--orchestra-choir)", labelX: 465, labelY: 80, stem: "female-choir" },
      { name: "Male Choir", count: 8, centerX: 935, centerY: 110, radius: 0, layout: "line", lineStartX: 760, lineEndX: 1110, lineY: 110, startAngle: 0, endAngle: 0, color: "var(--orchestra-choir)", labelX: 935, labelY: 80, stem: "male-choir" },
      { name: "Gong", count: 1, centerX: 210, centerY: 160, radius: 0, layout: "line", lineStartX: 210, lineEndX: 210, lineY: 160, startAngle: 0, endAngle: 0, color: "var(--orchestra-percussion)", labelX: 210, labelY: 203, stem: "gong" },
      { name: "Drum", count: 1, centerX: 325, centerY: 160, radius: 0, layout: "line", lineStartX: 325, lineEndX: 325, lineY: 160, startAngle: 0, endAngle: 0, color: "var(--orchestra-percussion)", labelX: 325, labelY: 203, stem: "drum" },
      { name: "Percussion", count: 1, centerX: 440, centerY: 160, radius: 0, layout: "line", lineStartX: 440, lineEndX: 440, lineY: 160, startAngle: 0, endAngle: 0, color: "var(--orchestra-percussion)", labelX: 440, labelY: 203, stem: "percussion" },
      { name: "Cymbals", count: 1, centerX: 554, centerY: 160, radius: 0, layout: "line", lineStartX: 554, lineEndX: 554, lineY: 160, startAngle: 0, endAngle: 0, color: "var(--orchestra-percussion)", labelX: 554, labelY: 203, stem: "cymbals" },
      { name: "Bass Drum", count: 1, centerX: 669, centerY: 160, radius: 0, layout: "line", lineStartX: 669, lineEndX: 669, lineY: 160, startAngle: 0, endAngle: 0, color: "var(--orchestra-percussion)", labelX: 669, labelY: 203, stem: "bass-drum" },
      { name: "Timpani", count: 1, centerX: 784, centerY: 160, radius: 0, layout: "line", lineStartX: 784, lineEndX: 784, lineY: 160, startAngle: 0, endAngle: 0, color: "var(--orchestra-percussion)", labelX: 784, labelY: 203 },
      { name: "Trumpet", count: 3, centerX: 899, centerY: 160, radius: 0, layout: "line", lineStartX: 859, lineEndX: 939, lineY: 160, startAngle: 0, endAngle: 0, color: "var(--orchestra-brass)", labelX: 899, labelY: 203 },
      { name: "Trombone", count: 2, centerX: 1013, centerY: 160, radius: 0, layout: "line", lineStartX: 993, lineEndX: 1033, lineY: 160, startAngle: 0, endAngle: 0, color: "var(--orchestra-brass)", labelX: 1013, labelY: 203, stem: "trombone" },
      { name: "Tuba", count: 1, centerX: 1128, centerY: 160, radius: 0, layout: "line", lineStartX: 1128, lineEndX: 1128, lineY: 160, startAngle: 0, endAngle: 0, color: "var(--orchestra-brass)", labelX: 1128, labelY: 203, stem: "tuba" },
      { name: "Flute", count: 2, centerX: 635, centerY: 275, radius: 0, layout: "line", lineStartX: 635, lineEndX: 635, lineStartY: 255, lineEndY: 295, startAngle: 0, endAngle: 0, color: "var(--orchestra-woodwind)", labelX: 635, labelY: 335, stem: "flute" },
      { name: "Clarinet", count: 2, centerX: 725, centerY: 275, radius: 0, layout: "line", lineStartX: 725, lineEndX: 725, lineStartY: 255, lineEndY: 295, startAngle: 0, endAngle: 0, color: "var(--orchestra-woodwind)", labelX: 725, labelY: 335, stem: "clarinet" },
      { name: "Oboe", count: 2, centerX: 815, centerY: 275, radius: 0, layout: "line", lineStartX: 815, lineEndX: 815, lineStartY: 255, lineEndY: 295, startAngle: 0, endAngle: 0, color: "var(--orchestra-woodwind)", labelX: 815, labelY: 335 },
      { name: "Bassoon", count: 2, centerX: 905, centerY: 275, radius: 0, layout: "line", lineStartX: 905, lineEndX: 905, lineStartY: 255, lineEndY: 295, startAngle: 0, endAngle: 0, color: "var(--orchestra-woodwind)", labelX: 905, labelY: 335 },
      { name: "Horn", count: 3, centerX: 1010, centerY: 275, radius: 0, layout: "line", lineStartX: 970, lineEndX: 1050, lineY: 275, startAngle: 0, endAngle: 0, color: "var(--orchestra-brass)", labelX: 1010, labelY: 335, stem: "horn" },
      { name: "Electric Guitar", count: 1, centerX: 375, centerY: 250, radius: 0, startAngle: 0, endAngle: 0, color: "var(--orchestra-guitar)", labelX: 375, labelY: 290 },
      { name: "Guitar Bass", count: 1, centerX: 440, centerY: 315, radius: 0, startAngle: 0, endAngle: 0, color: "var(--orchestra-guitar)", labelX: 440, labelY: 355, stem: "guitar-bass" },
      { name: "Synthesizer", count: 1, centerX: 535, centerY: 275, radius: 0, startAngle: 0, endAngle: 0, color: "var(--orchestra-synth)", labelX: 535, labelY: 315, stem: "synthesizer" },
      { name: "Piano", count: 1, centerX: 360, centerY: 390, radius: 0, startAngle: 0, endAngle: 0, color: "var(--orchestra-neutral)", labelX: 360, labelY: 430, stem: "piano" },
      { name: "1st Violin", count: 12, columns: 4, centerX: 700, centerY: 760, radius: 290, radii: [235, 290, 345], startAngle: 210, endAngle: 234, color: "var(--orchestra-strings)", labelX: 420, labelY: 470, stems: ["1st-violin", "strings"] },
      { name: "2nd Violin", count: 12, columns: 4, centerX: 700, centerY: 760, radius: 290, radii: [235, 290, 345], startAngle: 246, endAngle: 270, color: "var(--orchestra-strings)", labelX: 600, labelY: 380, stems: ["2nd-violin", "strings"] },
      { name: "Viola", count: 9, columns: 3, centerX: 700, centerY: 760, radius: 290, radii: [235, 290, 345], startAngle: 282, endAngle: 300, color: "var(--orchestra-strings)", labelX: 800, labelY: 380, stems: ["viola", "strings"] },
      { name: "Cello", count: 6, columns: 3, centerX: 700, centerY: 760, radius: 262, radii: [235, 290], startAngle: 312, endAngle: 330, color: "var(--orchestra-strings)", labelX: 955, labelY: 675, stems: ["cello", "strings"] },
      { name: "Bass", count: 3, columns: 3, centerX: 700, centerY: 760, radius: 380, radii: [380], startAngle: 312, endAngle: 330, color: "var(--orchestra-strings)", labelX: 990, labelY: 450, stems: ["bass", "strings"] }
    ];

    if (orchestra && orchestraStage) {
      const svgNamespace = "http://www.w3.org/2000/svg";
      const safariGlowFilterId = "orchestra-safari-glow";
      if (appleWebKitVisual) {
        const definitions = document.createElementNS(svgNamespace, "defs");
        const glowFilter = document.createElementNS(svgNamespace, "filter");
        glowFilter.setAttribute("id", safariGlowFilterId);
        glowFilter.setAttribute("x", "-120%");
        glowFilter.setAttribute("y", "-120%");
        glowFilter.setAttribute("width", "340%");
        glowFilter.setAttribute("height", "340%");
        glowFilter.setAttribute("color-interpolation-filters", "sRGB");
        const wideBlur = document.createElementNS(svgNamespace, "feGaussianBlur");
        wideBlur.setAttribute("in", "SourceGraphic");
        wideBlur.setAttribute("stdDeviation", "8");
        wideBlur.setAttribute("result", "wideGlow");
        const tightBlur = document.createElementNS(svgNamespace, "feGaussianBlur");
        tightBlur.setAttribute("in", "SourceGraphic");
        tightBlur.setAttribute("stdDeviation", "3");
        tightBlur.setAttribute("result", "tightGlow");
        const merge = document.createElementNS(svgNamespace, "feMerge");
        ["wideGlow", "wideGlow", "tightGlow", "tightGlow", "SourceGraphic"].forEach((source) => {
          const node = document.createElementNS(svgNamespace, "feMergeNode");
          node.setAttribute("in", source);
          merge.append(node);
        });
        glowFilter.append(wideBlur, tightBlur, merge);
        definitions.append(glowFilter);
        orchestra.insertBefore(definitions, orchestra.firstChild);
      }
      orchestraSections.forEach((section) => {
        const group = document.createElementNS(svgNamespace, "g");
        group.classList.add("orchestra-section");
        group.dataset.orchestraSection = section.name;
        const sectionStems = section.stems ?? (section.stem ? [section.stem] : []);
        if (sectionStems.length) {
          group.dataset.stemKeys = sectionStems.join("|");
          group.dataset.stemLabel = `${section.name}, ${section.count} ${section.count === 1 ? "seat" : "seats"}`;
        }
        group.style.setProperty("--section-color", section.color);
        const seatPositions = [];
        if (section.layout === "line") {
          for (let index = 0; index < section.count; index += 1) {
            const ratio = section.count > 1 ? index / (section.count - 1) : .5;
            seatPositions.push({
              x: section.lineStartX + (section.lineEndX - section.lineStartX) * ratio,
              y: (section.lineStartY ?? section.lineY) + ((section.lineEndY ?? section.lineY) - (section.lineStartY ?? section.lineY)) * ratio
            });
          }
        } else if (section.columns) {
          for (let column = 0; column < section.columns; column += 1) {
            const ratio = section.columns > 1 ? column / (section.columns - 1) : .5;
            const angle = (section.startAngle + (section.endAngle - section.startAngle) * ratio) * Math.PI / 180;
            section.radii.forEach((radius) => {
              seatPositions.push({
                x: section.centerX + Math.cos(angle) * radius,
                y: section.centerY + Math.sin(angle) * radius
              });
            });
          }
        } else {
          const radii = section.radii ?? [section.radius];
          radii.forEach((radius, rowIndex) => {
            const baseCount = Math.floor(section.count / radii.length);
            const rowCount = baseCount + (rowIndex < section.count % radii.length ? 1 : 0);
            for (let column = 0; column < rowCount; column += 1) {
              const ratio = rowCount > 1 ? column / (rowCount - 1) : .5;
              const angle = (section.startAngle + (section.endAngle - section.startAngle) * ratio) * Math.PI / 180;
              seatPositions.push({
                x: section.centerX + Math.cos(angle) * radius,
                y: section.centerY + Math.sin(angle) * radius
              });
            }
          });
        }
        const seatHull = getSeatHull(seatPositions);
        let hitArea;
        if (seatHull.length === 1) {
          hitArea = document.createElementNS(svgNamespace, "circle");
          hitArea.setAttribute("cx", String(seatHull[0].x));
          hitArea.setAttribute("cy", String(seatHull[0].y));
          hitArea.setAttribute("r", "28");
        } else if (seatHull.length === 2) {
          hitArea = document.createElementNS(svgNamespace, "line");
          hitArea.setAttribute("x1", String(seatHull[0].x));
          hitArea.setAttribute("y1", String(seatHull[0].y));
          hitArea.setAttribute("x2", String(seatHull[1].x));
          hitArea.setAttribute("y2", String(seatHull[1].y));
          hitArea.setAttribute("stroke-width", "56");
        } else {
          hitArea = document.createElementNS(svgNamespace, "polygon");
          hitArea.setAttribute("points", seatHull.map(({ x, y }) => `${x},${y}`).join(" "));
          hitArea.setAttribute("stroke-width", "44");
        }
        if (hitArea) {
          hitArea.classList.add("orchestra-hit-area");
          group.append(hitArea);
        }
        const glowLayer = document.createElementNS(svgNamespace, "g");
        glowLayer.classList.add("orchestra-glow-layer");
        glowLayer.setAttribute("aria-hidden", "true");
        if (appleWebKitVisual) {
          glowLayer.setAttribute("filter", `url(#${safariGlowFilterId})`);
          glowLayer.style.filter = `url(#${safariGlowFilterId})`;
        }
        group.append(glowLayer);
        if (seatPositions.length === 1) {
          const [{ x, y }] = seatPositions;
          const glowBounds = document.createElementNS(svgNamespace, "circle");
          glowBounds.setAttribute("cx", String(x));
          glowBounds.setAttribute("cy", String(y));
          glowBounds.setAttribute("r", "42");
          glowBounds.setAttribute("fill", "transparent");
          glowBounds.setAttribute("stroke", "none");
          glowLayer.append(glowBounds);
        }
        const seatLayer = document.createElementNS(svgNamespace, "g");
        seatLayer.classList.add("orchestra-seat-layer");
        group.append(seatLayer);
        seatPositions.forEach(({ x, y }) => {
          const glowCircle = document.createElementNS(svgNamespace, "circle");
          glowCircle.classList.add("orchestra-glow-seat");
          glowCircle.setAttribute("cx", String(x));
          glowCircle.setAttribute("cy", String(y));
          glowCircle.setAttribute("r", String(section.count >= 10 ? 11 : 12));
          glowLayer.append(glowCircle);
          const circle = document.createElementNS(svgNamespace, "circle");
          circle.classList.add("orchestra-seat");
          circle.setAttribute("cx", String(x));
          circle.setAttribute("cy", String(y));
          circle.setAttribute("r", String(section.count >= 10 ? 11 : 12));
          seatLayer.append(circle);
        });
        const label = document.createElementNS(svgNamespace, "text");
        label.classList.add("orchestra-label");
        label.setAttribute("x", String(section.labelX));
        label.setAttribute("y", String(section.labelY));
        label.textContent = section.label ?? section.name;
        group.append(label);
        orchestraStage.append(group);
      });

      const setStringsEngaged = (engaged) => orchestraStage.classList.toggle("is-strings-engaged", engaged);
      const orchestraIsInteractive = () => Boolean(mixer.querySelector("#music-reworks.active"));
      orchestra.addEventListener("pointerover", (event) => {
        if (!orchestraIsInteractive()) return;
        const group = event.target.closest?.('.orchestra-section[data-music-stem="strings"]');
        if (group) setStringsEngaged(true);
      });
      orchestra.addEventListener("pointerout", (event) => {
        if (!orchestraIsInteractive()) return;
        const group = event.target.closest?.('.orchestra-section[data-music-stem="strings"]');
        if (!group) return;
        const nextGroup = event.relatedTarget?.closest?.('.orchestra-section[data-music-stem="strings"]');
        if (!nextGroup) setStringsEngaged(false);
      });
      orchestra.addEventListener("focusin", (event) => {
        if (!orchestraIsInteractive()) return;
        if (event.target.closest?.('.orchestra-section[data-music-stem="strings"]')) setStringsEngaged(true);
      });
      orchestra.addEventListener("focusout", (event) => {
        if (!orchestraIsInteractive()) return;
        const nextGroup = event.relatedTarget?.closest?.('.orchestra-section[data-music-stem="strings"]');
        if (!nextGroup) setStringsEngaged(false);
      });

      orchestra.addEventListener("click", (event) => {
        if (!orchestraIsInteractive()) return;
        const group = event.target.closest?.(".orchestra-section");
        const stem = group?.dataset.musicStem;
        if (stem) setStemEnabled(stem, !stemState.get(stem));
      });
      orchestra.addEventListener("keydown", (event) => {
        if (!orchestraIsInteractive()) return;
        const group = event.target.closest?.(".orchestra-section");
        const stem = group?.dataset.musicStem;
        if (!stem || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        if (stem) setStemEnabled(stem, !stemState.get(stem));
      });
    }

    const orchestraSectionElements = [...orchestraStage.querySelectorAll(".orchestra-section")];
    const orchestraStemLevels = new Map();
    const transportTitle = transport.querySelector(".music-transport-heading strong");
    const stemFileNames = new Map([
      ["1st Violin.mp3", "1st-violin"],
      ["2nd Violin.mp3", "2nd-violin"],
      ["Bass Drum.mp3", "bass-drum"],
      ["Bass.mp3", "bass"],
      ["Aux Percussion.mp3", "percussion"],
      ["Auxiliary Percussion.mp3", "percussion"],
      ["Bell Tree.mp3", "percussion"],
      ["Chimes.mp3", "percussion"],
      ["Cello.mp3", "cello"],
      ["Clarinet.mp3", "clarinet"],
      ["Drum.mp3", "drum"],
      ["Female Choir.mp3", "female-choir"],
      ["Flute.mp3", "flute"],
      ["Guitar Bass.mp3", "guitar-bass"],
      ["Gong.mp3", "gong"],
      ["Horn.mp3", "horn"],
      ["Male Choir.mp3", "male-choir"],
      ["Maracas.mp3", "percussion"],
      ["Piano.mp3", "piano"],
      ["Percussion.mp3", "percussion"],
      ["Shaker.mp3", "percussion"],
      ["Symbals.mp3", "cymbals"],
      ["Synthesizer.mp3", "synthesizer"],
      ["Tambourine.mp3", "percussion"],
      ["Tubular Bells.mp3", "percussion"],
      ["Strings.mp3", "strings"],
      ["Trombone.mp3", "trombone"],
      ["Tuba.mp3", "tuba"],
      ["Viola.mp3", "viola"]
    ]);
    const stemState = new Map();
    let currentTrack = null;
    let audioRecords = [];
    let masterAudio = null;
    let totalDuration = 0;
    let playing = false;
    let animationFrame = 0;
    let lastSync = 0;
    let playableReady = 0;
    let tracksPrepared = false;
    let starting = false;
    let playToken = 0;
    let playWhenReady = false;
    let glowStopTimer = 0;
    let glowStopSeat = null;
    let trackSwitchToken = 0;
    let progressResetFrame = 0;
    let seekAnimationFrame = 0;
    let seekDisplayedValue = 0;
    let progressPointerActive = false;
    let progressPointerRect = null;
    let pendingTrackFolder = null;
    let pauseVolumeFade = 0;
    const stemVolumeFades = new Map();
    const appleWebKitAudio = /AppleWebKit/i.test(navigator.userAgent)
      && !/(Chrome|Chromium|CriOS|Edg|EdgiOS|OPR|FxiOS)/i.test(navigator.userAgent)
      && Boolean(window.AudioContext || window.webkitAudioContext);
    mixer.classList.toggle("is-safari", appleWebKitAudio);
    const scheduledAudioSupported = Boolean(window.AudioContext || window.webkitAudioContext);
    let scheduledBufferAudio = scheduledAudioSupported;
    let scheduledAudioContext = null;
    let visualAudioContext = null;
    let largeHallGraph = null;
    let scheduledStartTime = 0;
    let scheduledOffset = 0;
    let lastVisualFrameTime = 0;
    let lastProgressFrameTime = 0;
    let lastCurrentTimeText = "";
    let renderedProgressRatio = 0;
    let progressVisualWidth = 0;
    let visualFadeTimer = 0;
    let bufferingTrackToken = 0;

    const setTransportBuffering = (buffering, token = trackSwitchToken) => {
      if (buffering) {
        bufferingTrackToken = token;
        transport.classList.add("is-buffering");
        durationState.setAttribute("aria-label", "Loading track duration");
        durationState.setAttribute("aria-busy", "true");
        return;
      }
      if (token !== bufferingTrackToken || token !== trackSwitchToken) return;
      transport.classList.remove("is-buffering");
      durationState.removeAttribute("aria-label");
      durationState.removeAttribute("aria-busy");
    };

    const trackMaxVolume = () => Math.min(1, Math.max(0, Number(currentTrack?.maxVolume ?? 1)));
    const VISUAL_ENVELOPE_RATE = 30;
    const VISUAL_UPDATE_RATE = Math.max(1, Number(window.MUSIC_ENVELOPES?.rate) || VISUAL_ENVELOPE_RATE);
    const VISUAL_UPDATE_INTERVAL = 1000 / VISUAL_UPDATE_RATE;
    const PROGRESS_UPDATE_INTERVAL = 50;
    const STEM_FADE_DURATION = 1000;
    const dryOnlyReverbStems = new Set(["guitar-bass"]);

    const staticVisualEnvelope = (file) => {
      const source = window.MUSIC_ENVELOPES?.tracks?.[file];
      if (!source) return null;
      try {
        const binary = window.atob(source);
        const values = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) values[index] = binary.charCodeAt(index);
        return values;
      } catch {
        return null;
      }
    };

    const buildVisualEnvelope = (buffer) => {
      const binCount = Math.max(1, Math.ceil(buffer.duration * VISUAL_ENVELOPE_RATE));
      const envelope = new Float32Array(binCount);
      const samplesPerBin = buffer.sampleRate / VISUAL_ENVELOPE_RATE;
      const channels = Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, index) => buffer.getChannelData(index));
      for (let bin = 0; bin < binCount; bin += 1) {
        const start = Math.floor(bin * samplesPerBin);
        const end = Math.min(buffer.length, Math.floor((bin + 1) * samplesPerBin));
        const stride = Math.max(1, Math.floor((end - start) / 72));
        let energy = 0;
        let count = 0;
        for (let sample = start; sample < end; sample += stride) {
          channels.forEach((channel) => {
            const value = channel[sample] || 0;
            energy += value * value;
            count += 1;
          });
        }
        envelope[bin] = count ? Math.sqrt(energy / count) : 0;
      }
      return envelope;
    };

    const prepareVisualEnvelopes = (records) => {
      const missingRecords = records.filter((record) => !record.visualEnvelope);
      if (appleWebKitAudio || !missingRecords.length || !(window.AudioContext || window.webkitAudioContext)) return;
      if (!visualAudioContext) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        visualAudioContext = new AudioContextClass();
      }
      missingRecords.forEach(async (record) => {
        try {
          const response = await fetch(new URL(record.file, document.baseURI).href);
          if (!response.ok) return;
          const buffer = await visualAudioContext.decodeAudioData(await response.arrayBuffer());
          if (!audioRecords.includes(record)) return;
          record.visualEnvelope = buildVisualEnvelope(buffer);
          record.visualEnvelopeRate = VISUAL_ENVELOPE_RATE;
          record.visualEnvelopeNormalized = false;
        } catch {}
      });
    };

    const ensureScheduledAudioContext = () => {
      if (!scheduledBufferAudio) return null;
      if (!scheduledAudioContext) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        scheduledAudioContext = new AudioContextClass();
      }
      return scheduledAudioContext;
    };

    const buildLargeHallImpulse = (context) => {
      const duration = 4.5;
      const preDelay = .055;
      const length = Math.ceil(duration * context.sampleRate);
      const impulse = context.createBuffer(2, length, context.sampleRate);
      const earlyReflections = [
        [.052, .72],
        [.081, .5],
        [.117, .38],
        [.169, .26],
        [.238, .18]
      ];
      for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
        const data = impulse.getChannelData(channel);
        let seed = channel ? 0x5f3759df : 0x1f123bb5;
        let dampedNoise = 0;
        for (let index = Math.floor(preDelay * context.sampleRate); index < length; index += 1) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          const noise = (seed / 0xffffffff) * 2 - 1;
          dampedNoise = dampedNoise * .62 + noise * .38;
          const progress = index / length;
          const decay = Math.exp(-4.8 * progress);
          data[index] = dampedNoise * decay * (.96 - progress * .22);
        }
        earlyReflections.forEach(([delay, level], reflectionIndex) => {
          const stereoOffset = channel ? .0045 : 0;
          const sample = Math.min(length - 1, Math.floor((delay + stereoOffset) * context.sampleRate));
          data[sample] += level * (reflectionIndex % 2 ? -1 : 1);
        });
      }
      return impulse;
    };

    const ensureLargeHallGraph = (context) => {
      if (largeHallGraph?.context === context) return largeHallGraph;
      try {
        const dryInput = context.createGain();
        const reverbInput = context.createGain();
        const convolver = context.createConvolver();
        const wetGain = context.createGain();
        const outputGain = context.createGain();
        const limiter = context.createDynamicsCompressor();
        convolver.buffer = buildLargeHallImpulse(context);
        convolver.normalize = true;
        dryInput.gain.value = .86;
        reverbInput.gain.value = 1;
        wetGain.gain.value = .32;
        outputGain.gain.value = .9;
        limiter.threshold.value = -8;
        limiter.knee.value = 4;
        limiter.ratio.value = 6;
        limiter.attack.value = .003;
        limiter.release.value = .25;
        dryInput.connect(outputGain);
        reverbInput.connect(convolver);
        convolver.connect(wetGain);
        wetGain.connect(outputGain);
        outputGain.connect(limiter);
        limiter.connect(context.destination);
        largeHallGraph = { context, dryInput, reverbInput, convolver, wetGain, outputGain, limiter };
        mixer.dataset.reverb = "large-hall";
        mixer.dataset.reverbMix = "32%";
      } catch {
        largeHallGraph = null;
        mixer.dataset.reverb = "none";
      }
      return largeHallGraph;
    };

    const ensureAudioGraph = (records = audioRecords) => {
      if (!scheduledBufferAudio || !records.length) return false;
      const context = ensureScheduledAudioContext();
      try {
        const hall = ensureLargeHallGraph(context);
        records.forEach((record) => {
          if (record.gainNode) return;
          const gain = context.createGain();
          const analyser = record.visualEnvelope ? null : context.createAnalyser();
          if (analyser) {
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = .58;
            gain.connect(analyser);
          }
          const outputNode = analyser || gain;
          if (hall) {
            outputNode.connect(hall.dryInput);
            record.reverbEnabled = !dryOnlyReverbStems.has(record.stem);
            if (record.reverbEnabled) outputNode.connect(hall.reverbInput);
          } else {
            record.reverbEnabled = false;
            outputNode.connect(context.destination);
          }
          gain.gain.value = 0;
          record.gainNode = gain;
          record.analyserNode = analyser;
          record.levelData = analyser ? new Uint8Array(analyser.fftSize) : null;
          record.visualGain = 0;
        });
      } catch {
        return false;
      }
      return records.every((record) => record.gainNode);
    };

    const ensureVisualAudioGraph = (records = audioRecords) => {
      if (scheduledBufferAudio) return ensureAudioGraph(records);
      return false;
    };

    const setRecordGain = (record, targetVolume, duration = 0) => {
      const volume = Math.min(1, Math.max(0, targetVolume));
      const context = scheduledBufferAudio ? scheduledAudioContext : visualAudioContext;
      if (record.gainNode && context) {
        const gain = record.gainNode.gain;
        const now = context.currentTime;
        if (typeof gain.cancelAndHoldAtTime === "function") gain.cancelAndHoldAtTime(now);
        else {
          gain.cancelScheduledValues(now);
          gain.setValueAtTime(gain.value, now);
        }
        if (duration > 0) {
          const startVolume = gain.value;
          const curve = new Float32Array(64);
          for (let index = 0; index < curve.length; index += 1) {
            const progress = index / (curve.length - 1);
            const eased = .5 - Math.cos(Math.PI * progress) / 2;
            curve[index] = startVolume + (volume - startVolume) * eased;
          }
          gain.setValueCurveAtTime(curve, now, duration / 1000);
        } else gain.setValueAtTime(volume, now);
        return;
      }
      record.audio.volume = volume;
    };

    const stopScheduledSource = (record, when = 0) => {
      if (record.sourceNode) {
        try { record.sourceNode.stop(when); } catch {}
        record.sourceNode.disconnect();
      }
      record.sourceNode = null;
    };

    const scheduledPlaybackTime = () => {
      if (!scheduledBufferAudio || !scheduledAudioContext) return masterAudio?.currentTime || 0;
      const elapsed = playing ? Math.max(0, scheduledAudioContext.currentTime - scheduledStartTime) : 0;
      return Math.min(totalDuration || Infinity, scheduledOffset + elapsed);
    };

    const startScheduledSources = (offset = scheduledOffset, fadeDuration = 120) => {
      if (!scheduledBufferAudio || !scheduledAudioContext || !audioRecords.every((record) => record.buffer)) return false;
      const context = scheduledAudioContext;
      const startAt = context.currentTime + .06;
      scheduledOffset = Math.max(0, Math.min(offset, Math.max(0, totalDuration - .01)));
      scheduledStartTime = startAt;
      ensureAudioGraph();
      audioRecords.forEach((record) => {
        stopScheduledSource(record);
        const source = context.createBufferSource();
        source.buffer = record.buffer;
        source.connect(record.gainNode);
        record.sourceNode = source;
        const target = stemState.get(record.stem) ? trackMaxVolume() : 0;
        const gain = record.gainNode.gain;
        gain.cancelScheduledValues(context.currentTime);
        gain.setValueAtTime(0, context.currentTime);
        gain.setValueAtTime(0, startAt);
        if (fadeDuration > 0) gain.linearRampToValueAtTime(target, startAt + fadeDuration / 1000);
        else gain.setValueAtTime(target, startAt);
        if (scheduledOffset < record.buffer.duration) source.start(startAt, scheduledOffset);
      });
      return true;
    };

    const setScheduledPlaybackTime = (time) => {
      const nextTime = Math.max(0, Math.min(time, totalDuration || time));
      scheduledOffset = nextTime;
      if (playing) startScheduledSources(nextTime, 60);
    };

    const releaseAudioRecord = (record) => {
      stopScheduledSource(record);
      record.gainNode?.disconnect();
      record.analyserNode?.disconnect();
      record.mediaSourceNode?.disconnect();
      record.mediaStream?.getTracks().forEach((track) => track.stop());
      record.gainNode = null;
      record.analyserNode = null;
      record.mediaSourceNode = null;
      record.mediaStream = null;
      record.reverbEnabled = false;
      record.levelData = null;
      record.visualEnvelope = null;
      record.buffer = null;
      record.audio.pause();
      record.audio.removeAttribute("src");
      record.audio.load();
      record.audio.remove();
    };

    const prepareTracks = () => {
      if (!currentTrack || !audioRecords.length || tracksPrepared) return;
      const preparationToken = trackSwitchToken;
      tracksPrepared = true;
      playButton.disabled = true;
      setTransportBuffering(true, preparationToken);
      if (scheduledBufferAudio) {
        const context = ensureScheduledAudioContext();
        const records = [...audioRecords];
        Promise.all(records.map(async (record) => {
          const response = await fetch(new URL(record.file, document.baseURI).href);
          if (!response.ok && response.status !== 0) throw new Error(`Audio request failed: ${response.status}`);
          record.buffer = await context.decodeAudioData(await response.arrayBuffer());
          return record;
        })).then(() => {
          if (!records.every((record) => audioRecords.includes(record))) return;
          playableReady = records.length;
          ensureAudioGraph(records);
          updateDuration();
          setTransportBuffering(false, preparationToken);
          if (!pendingTrackFolder && !playing) playButton.disabled = false;
          if (playWhenReady) {
            playWhenReady = false;
            playAll();
          }
        }).catch(() => {
          if (!records.some((record) => audioRecords.includes(record))) return;
          scheduledBufferAudio = false;
          playableReady = 0;
          records.forEach((record) => {
            record.buffer = null;
            record.gainNode?.disconnect();
            record.analyserNode?.disconnect();
            record.gainNode = null;
            record.analyserNode = null;
            record.levelData = null;
            record.audio.preload = "auto";
            record.audio.src = new URL(record.file, document.baseURI).href;
            record.audio.load();
          });
        });
        return;
      }
      audioRecords.forEach(({ audio, file }) => {
        audio.preload = "auto";
        audio.src = new URL(file, document.baseURI).href;
        audio.load();
      });
      prepareVisualEnvelopes(audioRecords);
    };

    const formatTime = (seconds) => {
      if (!Number.isFinite(seconds) || seconds < 0) return "—:—";
      const rounded = Math.floor(seconds);
      return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
    };

    const createTimeDigit = () => {
      const slot = document.createElement("span");
      slot.className = "music-time-digit";
      slot.setAttribute("aria-hidden", "true");
      const track = document.createElement("span");
      track.className = "music-time-digit-track";
      for (let digit = 0; digit <= 9; digit += 1) {
        const glyph = document.createElement("span");
        glyph.textContent = String(digit);
        track.append(glyph);
      }
      slot.append(track);
      return { slot, track, value: -1 };
    };

    const currentTimeDigits = [createTimeDigit(), createTimeDigit(), createTimeDigit()];
    const timeColon = document.createElement("span");
    timeColon.className = "music-time-colon";
    timeColon.setAttribute("aria-hidden", "true");
    timeColon.textContent = ":";
    currentOutput.replaceChildren(
      currentTimeDigits[0].slot,
      timeColon,
      currentTimeDigits[1].slot,
      currentTimeDigits[2].slot
    );

    const renderCurrentTimeText = (text) => {
      const match = /^(\d+):(\d{2})$/.exec(text);
      if (!match) return;
      const minutes = Math.min(9, Number(match[1]));
      const seconds = Number(match[2]);
      const values = [minutes, Math.floor(seconds / 10), seconds % 10];
      currentTimeDigits.forEach((digit, index) => {
        const value = values[index];
        if (digit.value === value) return;
        digit.value = value;
        digit.track.style.transform = `translate3d(0, -${value}em, 0)`;
      });
      currentOutput.setAttribute("aria-label", text);
      lastCurrentTimeText = text;
    };

    const updateDuration = () => {
      const durations = audioRecords
        .map((record) => scheduledBufferAudio ? record.buffer?.duration : record.audio.duration)
        .filter((duration) => Number.isFinite(duration));
      if (!durations.length) return;
      totalDuration = Math.max(...durations);
      if (!scheduledBufferAudio) masterAudio = audioRecords.find(({ audio }) => audio.duration === totalDuration)?.audio ?? masterAudio;
      durationOutput.textContent = formatTime(totalDuration);
    };

    const bindAudioEvents = (audio, preparationToken) => {
      audio.addEventListener("loadedmetadata", () => {
        if (!audioRecords.some((record) => record.audio === audio)) return;
        updateDuration();
      }, { once: true });
      audio.addEventListener("canplay", () => {
        if (!audioRecords.some((record) => record.audio === audio)) return;
        playableReady += 1;
        if (playableReady === audioRecords.length && !playing) {
          updateDuration();
          setTransportBuffering(false, preparationToken);
          if (pendingTrackFolder) return;
          playButton.disabled = false;
          if (playWhenReady) {
            playWhenReady = false;
            playAll();
          }
        }
      }, { once: true });
      audio.addEventListener("error", () => {
        if (!audioRecords.some((record) => record.audio === audio)) return;
        playWhenReady = false;
        playButton.disabled = true;
        playButton.setAttribute("aria-label", "Audio could not be loaded");
        setTransportBuffering(false, preparationToken);
      }, { once: true });
    };

    const renderProgressRatio = (ratio, syncNativeInput = true) => {
      const clampedRatio = Math.min(1, Math.max(0, ratio));
      renderedProgressRatio = clampedRatio;
      progressFill.style.transform = `scaleX(${clampedRatio})`;
      const thumbTravel = Math.max(0, progressVisualWidth - 8);
      progressThumb.style.transform = `translate3d(${(clampedRatio * thumbTravel).toFixed(2)}px, 0, 0)`;
      if (syncNativeInput) progress.value = String(Math.round(clampedRatio * 1000));
    };

    const measureProgressVisual = () => {
      progressVisualWidth = progressVisual.getBoundingClientRect().width;
      renderProgressRatio(renderedProgressRatio, false);
    };
    if (window.ResizeObserver) {
      const progressResizeObserver = new ResizeObserver(measureProgressVisual);
      progressResizeObserver.observe(progressVisual);
    } else {
      window.addEventListener("resize", measureProgressVisual, { passive: true });
    }
    measureProgressVisual();

    const updateProgress = (time = scheduledPlaybackTime(), syncNativeInput = true) => {
      const ratio = totalDuration > 0 ? Math.min(1, Math.max(0, time / totalDuration)) : 0;
      renderProgressRatio(ratio, syncNativeInput);
      const currentTimeText = formatTime(time);
      if (currentTimeText !== lastCurrentTimeText) {
        renderCurrentTimeText(currentTimeText);
      }
    };

    const animateSeekToValue = (targetValue, duration = 100) => {
      if (!audioRecords.length) return;
      if (seekAnimationFrame) window.cancelAnimationFrame(seekAnimationFrame);
      const startValue = progressPointerActive ? seekDisplayedValue : renderedProgressRatio * 1000;
      const clampedTarget = Math.min(1000, Math.max(0, targetValue));
      const targetTime = totalDuration * (clampedTarget / 1000);
      renderProgressRatio(startValue / 1000, true);
      if (scheduledBufferAudio) setScheduledPlaybackTime(targetTime);
      else audioRecords.forEach(({ audio }) => {
        if (Number.isFinite(audio.duration)) audio.currentTime = Math.min(targetTime, audio.duration);
      });
      renderCurrentTimeText(formatTime(targetTime));
      const startedAt = performance.now();
      const updateSeek = (now) => {
        const ratio = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - Math.pow(1 - ratio, 3);
        const nextValue = startValue + (clampedTarget - startValue) * eased;
        seekDisplayedValue = nextValue;
        renderProgressRatio(nextValue / 1000, false);
        if (ratio < 1) {
          seekAnimationFrame = window.requestAnimationFrame(updateSeek);
        } else {
          seekAnimationFrame = 0;
          seekDisplayedValue = clampedTarget;
          renderProgressRatio(clampedTarget / 1000, true);
        }
      };
      seekAnimationFrame = window.requestAnimationFrame(updateSeek);
    };

    const finishGlowCycle = () => {
      window.clearTimeout(glowStopTimer);
      glowStopTimer = 0;
      if (glowStopSeat) glowStopSeat.removeEventListener("animationiteration", finishGlowCycle);
      glowStopSeat = null;
      mixer.classList.remove("is-playing", "is-stopping-glow");
    };

    const setPlayingState = (nextPlaying) => {
      const wasPlaying = playing;
      playing = nextPlaying;
      playButton.classList.toggle("is-playing", playing);
      const title = trackTitle(currentTrack);
      playButton.setAttribute("aria-label", title ? `${playing ? "Pause" : "Play"} ${title}` : "Select a track to play");
      if (playing) {
        window.clearTimeout(glowStopTimer);
        if (glowStopSeat) glowStopSeat.removeEventListener("animationiteration", finishGlowCycle);
        glowStopSeat = null;
        mixer.classList.remove("is-stopping-glow");
        mixer.classList.add("is-playing");
      } else if (wasPlaying && mixer.classList.contains("is-playing")) {
        mixer.classList.add("is-stopping-glow");
        glowStopSeat = mixer.querySelector(".orchestra-section[data-music-stem]:not(.is-muted) .orchestra-seat");
        if (glowStopSeat) {
          glowStopSeat.addEventListener("animationiteration", finishGlowCycle, { once: true });
          glowStopTimer = window.setTimeout(finishGlowCycle, 2480);
        } else {
          finishGlowCycle();
        }
      } else {
        finishGlowCycle();
      }
    };

    const stopFrame = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    };

    const fadeOutOrchestraLevels = (duration = 1000) => {
      window.clearTimeout(visualFadeTimer);
      mixer.classList.add("is-visual-fading");
      orchestraSectionElements.forEach((section) => {
        if (section._orchestraGlowLevel !== "0") {
          section.style.setProperty("--orchestra-glow-level", "0");
          section._orchestraGlowLevel = "0";
        }
        section._orchestraLevel = 0;
      });
      audioRecords.forEach((record) => { record.visualGain = 0; });
      visualFadeTimer = window.setTimeout(() => {
        mixer.classList.remove("is-visual-fading");
        visualFadeTimer = 0;
      }, duration);
    };

    const updateOrchestraLevels = (timestamp) => {
      const deltaTime = lastVisualFrameTime ? Math.min(.1, (timestamp - lastVisualFrameTime) / 1000) : 1 / 60;
      lastVisualFrameTime = timestamp;
      mixer.classList.remove("is-visual-fading");
      orchestraStemLevels.clear();
      const playbackTime = scheduledPlaybackTime();
      audioRecords.forEach((record) => {
        const analyser = record.analyserNode;
        const data = record.levelData;
        let rms = 0;
        if (record.visualEnvelope) {
          const envelopeRate = record.visualEnvelopeRate || VISUAL_ENVELOPE_RATE;
          const envelopeIndex = Math.min(record.visualEnvelope.length - 1, Math.floor(playbackTime * envelopeRate));
          rms = record.visualEnvelope[Math.max(0, envelopeIndex)] || 0;
        } else if (analyser && data) {
          analyser.getByteTimeDomainData(data);
          let energy = 0;
          for (let index = 0; index < data.length; index += 1) {
            const sample = (data[index] - 128) / 128;
            energy += sample * sample;
          }
          rms = Math.sqrt(energy / data.length);
        } else {
          return;
        }
        const normalized = record.visualEnvelopeNormalized
          ? rms / 255
          : Math.pow(Math.min(1, Math.max(0, (rms - .006) * 4.6)), .82);
        const visualTarget = stemState.get(record.stem) ? 1 : 0;
        const visualDuration = visualTarget > (record.visualGain || 0) ? .12 : 1;
        const visualStep = Math.min(1, deltaTime / visualDuration);
        record.visualGain = (record.visualGain || 0) + (visualTarget - (record.visualGain || 0)) * visualStep;
        const level = normalized * record.visualGain;
        orchestraStemLevels.set(record.stem, Math.max(orchestraStemLevels.get(record.stem) || 0, level));
      });
      orchestraSectionElements.forEach((section) => {
        const stem = section.dataset.musicStem;
        const target = stem ? orchestraStemLevels.get(stem) || 0 : 0;
        const current = section._orchestraLevel || 0;
        const response = target > current ? .55 : .16;
        const level = current + (target - current) * response;
        section._orchestraLevel = level;
        const visualLevel = appleWebKitVisual
          ? Math.min(1, Math.pow(Math.max(0, level), .7) * 1.45)
          : Math.min(1, level);
        const renderedLevel = visualLevel < .006 ? "0" : visualLevel.toFixed(3);
        if (renderedLevel !== section._orchestraGlowLevel) {
          section.style.setProperty("--orchestra-glow-level", renderedLevel);
          section._orchestraGlowLevel = renderedLevel;
        }
      });
    };

    const cancelPauseVolumeFade = () => {
      if (pauseVolumeFade) {
        window.clearInterval(pauseVolumeFade);
        window.clearTimeout(pauseVolumeFade);
      }
      pauseVolumeFade = 0;
    };

    const pauseAll = (fadeDuration = 0) => {
      const pauseToken = ++playToken;
      const currentTimeBeforePause = scheduledPlaybackTime();
      starting = false;
      cancelPauseVolumeFade();
      stopFrame();
      setPlayingState(false);
      fadeOutOrchestraLevels(fadeDuration || 180);
      if (fadeDuration > 0 && audioRecords.length) {
        const records = [...audioRecords];
        if (ensureAudioGraph(records) || records.every((record) => record.gainNode)) {
          const pausedTime = currentTimeBeforePause;
          records.forEach((record) => setRecordGain(record, 0, fadeDuration));
          playButton.disabled = true;
          pauseVolumeFade = window.setTimeout(() => {
            if (pauseToken !== playToken) return;
            pauseVolumeFade = 0;
            scheduledOffset = Math.min(totalDuration, pausedTime + fadeDuration / 1000);
            records.forEach((record) => stopScheduledSource(record));
            updateProgress(scheduledOffset);
            if (currentTrack && records.every((record) => audioRecords.includes(record))) {
              playButton.disabled = false;
            }
          }, fadeDuration);
          return;
        }
        const startVolumes = records.map(({ audio }) => audio.volume);
        const pausedMaster = masterAudio;
        const startedAt = performance.now();
        playButton.disabled = true;
        const updateVolume = () => {
          if (pauseToken !== playToken) {
            cancelPauseVolumeFade();
            return;
          }
          const progress = Math.min(1, (performance.now() - startedAt) / fadeDuration);
          const easedProgress = .5 - Math.cos(Math.PI * progress) / 2;
          records.forEach(({ audio }, index) => {
            audio.volume = startVolumes[index] * (1 - easedProgress);
          });
          updateProgress(pausedMaster?.currentTime || 0);
          if (progress < 1) return;
          cancelPauseVolumeFade();
          records.forEach(({ audio }) => audio.pause());
          if (currentTrack && records.every(({ audio }) => audioRecords.some((record) => record.audio === audio))) {
            playButton.disabled = false;
          }
        };
        updateVolume();
        pauseVolumeFade = window.setInterval(updateVolume, 60);
        return;
      }
      if (scheduledBufferAudio) {
        scheduledOffset = currentTimeBeforePause;
        audioRecords.forEach((record) => stopScheduledSource(record));
      } else audioRecords.forEach(({ audio }) => audio.pause());
      updateProgress();
    };

    const updateFrame = (timestamp) => {
      if (!playing || (!scheduledBufferAudio && !masterAudio)) return;
      const masterTime = scheduledPlaybackTime();
      const musicVisible = musicView.classList.contains("active") && !document.hidden;
      if (musicVisible && (!lastVisualFrameTime || timestamp - lastVisualFrameTime >= VISUAL_UPDATE_INTERVAL)) {
        updateOrchestraLevels(timestamp);
      } else if (!musicVisible) {
        lastVisualFrameTime = 0;
      }
      if (!seekAnimationFrame && (!lastProgressFrameTime || timestamp - lastProgressFrameTime >= PROGRESS_UPDATE_INTERVAL)) {
        updateProgress(masterTime, false);
        lastProgressFrameTime = timestamp;
      }
      if (!appleWebKitAudio && timestamp - lastSync > 2000) {
        audioRecords.forEach(({ audio }) => {
          if (!audio.paused && Math.abs(audio.currentTime - masterTime) > .2) {
            audio.currentTime = Math.min(masterTime, Number.isFinite(audio.duration) ? audio.duration : masterTime);
          }
        });
        lastSync = timestamp;
      }
      if (totalDuration > 0 && masterTime >= totalDuration - .05) {
        pauseAll();
        const completionSwitchToken = trackSwitchToken;
        scheduledOffset = 0;
        if (!scheduledBufferAudio) audioRecords.forEach(({ audio }) => { audio.currentTime = 0; });
        playButton.disabled = true;
        animateProgressToStart(600, completionSwitchToken, () => {
          if (completionSwitchToken !== trackSwitchToken || !currentTrack) return;
          renderCurrentTimeText("0:00");
          playButton.disabled = false;
        });
        return;
      }
      animationFrame = window.requestAnimationFrame(updateFrame);
    };

    const playAll = async () => {
      if (!currentTrack || !audioRecords.length || starting) return;
      prepareTracks();
      if (scheduledBufferAudio) {
        const context = ensureScheduledAudioContext();
        try { await context.resume(); } catch {}
        ensureAudioGraph();
      } else if (ensureVisualAudioGraph()) {
        try { await visualAudioContext.resume(); } catch {}
      }
      if (playableReady < audioRecords.length) {
        playWhenReady = true;
        return;
      }
      starting = true;
      const token = ++playToken;
      const playbackTime = scheduledPlaybackTime();
      if (totalDuration > 0 && playbackTime >= totalDuration - .05) {
        scheduledOffset = 0;
        if (!scheduledBufferAudio) audioRecords.forEach(({ audio }) => { audio.currentTime = 0; });
      }
      const startTime = scheduledPlaybackTime();
      if (scheduledBufferAudio) {
        const started = startScheduledSources(startTime, 120);
        starting = false;
        if (!started || token !== playToken) {
          playButton.setAttribute("aria-label", `Play ${trackTitle(currentTrack)} to try again`);
          return;
        }
        setPlayingState(true);
        lastVisualFrameTime = 0;
        lastProgressFrameTime = 0;
        stopFrame();
        animationFrame = window.requestAnimationFrame(updateFrame);
        return;
      }
      audioRecords.forEach((record) => {
        const { audio, stem } = record;
        if (Number.isFinite(audio.duration)) audio.currentTime = Math.min(startTime, audio.duration);
        audio.playbackRate = 1;
        audio.muted = false;
        setRecordGain(record, stemState.get(stem) ? trackMaxVolume() : 0);
      });
      const playAttempts = audioRecords.map(({ audio }) => audio.play());
      starting = false;
      setPlayingState(true);
      lastVisualFrameTime = 0;
      lastProgressFrameTime = 0;
      stopFrame();
      lastSync = 0;
      animationFrame = window.requestAnimationFrame(updateFrame);
      Promise.allSettled(playAttempts).then((results) => {
        if (token !== playToken) return;
        if (results.every((result) => result.status === "rejected")) {
          pauseAll();
          playButton.setAttribute("aria-label", `Play ${trackTitle(currentTrack)} to try again`);
          return;
        }
      });
    };

    const setStemVolume = (stem, targetVolume, duration = 0) => {
      const activeFade = stemVolumeFades.get(stem);
      if (activeFade) window.clearInterval(activeFade);
      stemVolumeFades.delete(stem);
      const records = audioRecords.filter((record) => record.stem === stem);
      if (!records.length) return;
      if (ensureAudioGraph(records) || records.every((record) => record.gainNode)) {
        records.forEach((record) => setRecordGain(record, targetVolume, duration));
        return;
      }
      if (scheduledBufferAudio) return;
      if (duration <= 0) {
        records.forEach((record) => { record.audio.volume = targetVolume; });
        return;
      }
      const startVolumes = records.map((record) => record.audio.volume);
      const startedAt = performance.now();
      const updateVolume = () => {
        const progress = Math.min(1, (performance.now() - startedAt) / duration);
        const easedProgress = .5 - Math.cos(Math.PI * progress) / 2;
        records.forEach((record, index) => {
          record.audio.volume = startVolumes[index] + (targetVolume - startVolumes[index]) * easedProgress;
        });
        if (progress < 1) return;
        const fade = stemVolumeFades.get(stem);
        if (fade) window.clearInterval(fade);
        stemVolumeFades.delete(stem);
      };
      updateVolume();
      const fade = window.setInterval(updateVolume, 60);
      stemVolumeFades.set(stem, fade);
    };

    const fadeOutAndRelease = (records, duration = 1000) => {
      if (!records.length) return;
      if (ensureAudioGraph(records) || records.every((record) => record.gainNode)) {
        records.forEach((record) => setRecordGain(record, 0, duration));
        window.setTimeout(() => records.forEach(releaseAudioRecord), duration);
        return;
      }
      const startVolumes = records.map(({ audio }) => audio.volume);
      const startedAt = performance.now();
      let fade = 0;
      const updateVolume = () => {
        const progress = Math.min(1, (performance.now() - startedAt) / duration);
        const easedProgress = .5 - Math.cos(Math.PI * progress) / 2;
        records.forEach(({ audio }, index) => {
          audio.volume = startVolumes[index] * (1 - easedProgress);
        });
        if (progress < 1) return;
        window.clearInterval(fade);
        records.forEach(releaseAudioRecord);
      };
      updateVolume();
      fade = window.setInterval(updateVolume, 60);
    };

    const updateMasterControls = () => {
      const states = [...stemState.values()];
      const available = states.length > 0;
      const allOn = available && states.every(Boolean);
      const allOff = available && states.every((enabled) => !enabled);
      [[allOnControl, allOn], [allOffControl, allOff]].forEach(([control, active]) => {
        control.classList.toggle("is-disabled", !available);
        control.classList.toggle("is-active", active);
        control.setAttribute("tabindex", available ? "0" : "-1");
        control.setAttribute("aria-disabled", String(!available));
        control.setAttribute("aria-pressed", String(active));
      });
    };

    const setStemEnabled = (stem, enabled) => {
      if (!stemState.has(stem)) return;
      stemState.set(stem, enabled);
      setStemVolume(stem, enabled ? trackMaxVolume() : 0, STEM_FADE_DURATION);
      mixer.querySelectorAll(`[data-music-stem="${stem}"]`).forEach((section) => section.classList.toggle("is-muted", !enabled));
      updateMasterControls();
    };

    const updateOrchestraAvailability = () => {
      mixer.querySelectorAll(".orchestra-section[data-stem-keys]").forEach((section) => {
        const stem = section.dataset.stemKeys.split("|").find((stemKey) => stemState.has(stemKey));
        const available = Boolean(stem);
        section.classList.remove("is-muted");
        if (available) {
          section.dataset.musicStem = stem;
          section.setAttribute("role", "button");
          section.setAttribute("tabindex", "0");
          section.setAttribute("aria-label", section.dataset.stemLabel);
        } else {
          delete section.dataset.musicStem;
          section.removeAttribute("role");
          section.removeAttribute("tabindex");
          section.removeAttribute("aria-label");
        }
      });
      const engagedStringSection = orchestra.querySelector('.orchestra-section[data-music-stem="strings"]:hover, .orchestra-section[data-music-stem="strings"]:focus');
      orchestraStage.classList.toggle("is-strings-engaged", Boolean(engagedStringSection));
      updateMasterControls();
    };

    const clearCurrentTrack = (resetDisplay = true, preservePlayIcon = false) => {
      playToken += 1;
      starting = false;
      playWhenReady = false;
      cancelPauseVolumeFade();
      if (seekAnimationFrame) window.cancelAnimationFrame(seekAnimationFrame);
      seekAnimationFrame = 0;
      seekDisplayedValue = 0;
      progressPointerActive = false;
      stopFrame();
      audioRecords.forEach(releaseAudioRecord);
      stemVolumeFades.forEach((fade) => window.clearInterval(fade));
      stemVolumeFades.clear();
      audioRecords = [];
      stemState.clear();
      updateMasterControls();
      masterAudio = null;
      totalDuration = 0;
      scheduledStartTime = 0;
      scheduledOffset = 0;
      playableReady = 0;
      tracksPrepared = false;
      playing = false;
      currentTrack = null;
      if (!preservePlayIcon) playButton.classList.remove("is-playing");
      finishGlowCycle();
      if (resetDisplay) {
        updateProgress(0);
        durationOutput.textContent = "—:—";
      }
    };

    const animateProgressToStart = (duration, switchToken, onComplete = null) => {
      if (progressResetFrame) window.cancelAnimationFrame(progressResetFrame);
      const startValue = renderedProgressRatio * 1000;
      const startedAt = performance.now();
      const updateReset = (now) => {
        if (switchToken !== trackSwitchToken) {
          progressResetFrame = 0;
          return;
        }
        const ratio = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - Math.pow(1 - ratio, 3);
        const nextValue = startValue * (1 - eased);
        renderProgressRatio(nextValue / 1000, false);
        if (ratio < 1) {
          progressResetFrame = window.requestAnimationFrame(updateReset);
        } else {
          progressResetFrame = 0;
          renderProgressRatio(0, true);
          if (onComplete) onComplete();
        }
      };
      progressResetFrame = window.requestAnimationFrame(updateReset);
    };

    const selectTrack = (folder) => {
      const nextTrack = musicTracks.find((track) => track.folder === folder);
      if (!nextTrack || nextTrack === currentTrack || pendingTrackFolder) return;
      pendingTrackFolder = folder;
      const switchToken = ++trackSwitchToken;
      setTransportBuffering(true, switchToken);
      const wasPlaying = playButton.classList.contains("is-playing");
      const shouldFadeAudio = (playing || pauseVolumeFade) && audioRecords.length > 0;
      const shouldAnimateCurrentTime = lastCurrentTimeText !== "0:00";
      transport.classList.remove("is-switching-track", "is-switching-time", "is-switching-current-time", "is-switching-icon");
      void transport.offsetWidth;
      transport.classList.add("is-switching-track", "is-switching-time");
      if (shouldAnimateCurrentTime) transport.classList.add("is-switching-current-time");
      if (wasPlaying) transport.classList.add("is-switching-icon");
      trackItems.forEach((item) => {
        const selected = item.dataset.musicFolder === folder;
        item.classList.toggle("is-active", selected);
        if (selected) item.setAttribute("aria-current", "true");
        else item.removeAttribute("aria-current");
      });
      playButton.disabled = true;
      progress.disabled = true;
      if (shouldFadeAudio) {
        cancelPauseVolumeFade();
        stemVolumeFades.forEach((fade) => window.clearInterval(fade));
        stemVolumeFades.clear();
        const fadingRecords = audioRecords;
        audioRecords = [];
        fadeOutAndRelease(fadingRecords, 1000);
      }
      fadeOutOrchestraLevels(shouldFadeAudio ? 1000 : 180);
      clearCurrentTrack(false, wasPlaying);
      animateProgressToStart(600, switchToken);

      window.setTimeout(() => {
        if (switchToken !== trackSwitchToken) return;
        playButton.classList.remove("is-playing");
        currentTrack = nextTrack;
        mixer.classList.add("has-track");
        if (!shouldFadeAudio) pendingTrackFolder = null;
        transport.classList.remove("is-empty");
        const title = trackTitle(currentTrack);
        if (transportTitle) transportTitle.textContent = title;
        openTrackButton.disabled = false;
        openTrackButton.setAttribute("aria-label", `Open ${title} in Drumbeat and Melody`);

        audioRecords = currentTrack.files.flatMap((fileName) => {
          const stem = stemFileNames.get(fileName) ?? fileName.replace(/\.mp3$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
          stemState.set(stem, true);
          const audioFolder = currentTrack.folder;
          const file = `assets/Music/${audioFolder}/${fileName}`;
          const visualEnvelope = staticVisualEnvelope(file);
          const audio = new Audio();
          audio.preload = "none";
          audio.hidden = true;
          audio.muted = false;
          transport.append(audio);
          bindAudioEvents(audio, switchToken);
          return [{
            stem,
            file,
            audio,
            visualEnvelope,
            visualEnvelopeRate: window.MUSIC_ENVELOPES?.rate || VISUAL_ENVELOPE_RATE,
            visualEnvelopeNormalized: Boolean(visualEnvelope)
          }];
        });
        masterAudio = audioRecords[0]?.audio ?? null;
        updateOrchestraAvailability();
        progress.disabled = !audioRecords.length;
        playButton.setAttribute("aria-label", audioRecords.length ? `Play ${title}` : `${title} has no playable parts`);
        durationOutput.textContent = "—:—";
        renderCurrentTimeText("0:00");
        if (audioRecords.length) prepareTracks();
        else setTransportBuffering(false, switchToken);
      }, 300);

      if (shouldFadeAudio) {
        window.setTimeout(() => {
          if (switchToken !== trackSwitchToken) return;
          pendingTrackFolder = null;
          if (playableReady === audioRecords.length && audioRecords.length && !playing) playButton.disabled = false;
        }, 1000);
      }

      window.setTimeout(() => {
        if (switchToken !== trackSwitchToken) return;
        transport.classList.remove("is-switching-track", "is-switching-time", "is-switching-current-time", "is-switching-icon");
        renderProgressRatio(0, true);
      }, 600);
    };

    playButton.addEventListener("click", () => {
      if (playing) pauseAll(1000);
      else playAll();
    });
    const seekFromPointer = (event) => {
      if (!progressPointerRect?.width) return;
      const ratio = (event.clientX - progressPointerRect.left) / progressPointerRect.width;
      animateSeekToValue(Math.min(1000, Math.max(0, ratio * 1000)), 100);
    };
    progress.addEventListener("focus", () => {
      progress.value = String(Math.round(renderedProgressRatio * 1000));
    });
    progress.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      seekDisplayedValue = renderedProgressRatio * 1000;
      progressPointerActive = true;
      progressPointerRect = progress.getBoundingClientRect();
      try { progress.setPointerCapture(event.pointerId); } catch {}
      try { progress.focus({ preventScroll: true }); } catch { progress.focus(); }
      seekFromPointer(event);
    });
    progress.addEventListener("pointermove", (event) => {
      if (!progressPointerActive) return;
      event.preventDefault();
      seekFromPointer(event);
    });
    progress.addEventListener("pointerup", (event) => {
      try { progress.releasePointerCapture(event.pointerId); } catch {}
      progressPointerActive = false;
      progressPointerRect = null;
    });
    progress.addEventListener("pointercancel", (event) => {
      try { progress.releasePointerCapture(event.pointerId); } catch {}
      progressPointerActive = false;
      progressPointerRect = null;
    });
    progress.addEventListener("input", () => {
      if (!audioRecords.length) return;
      const targetValue = Number(progress.value);
      if (progressPointerActive) {
        animateSeekToValue(targetValue, 100);
        return;
      }
      if (seekAnimationFrame) window.cancelAnimationFrame(seekAnimationFrame);
      seekAnimationFrame = 0;
      const targetTime = totalDuration * (targetValue / 1000);
      if (scheduledBufferAudio) setScheduledPlaybackTime(targetTime);
      else audioRecords.forEach(({ audio }) => {
        if (Number.isFinite(audio.duration)) audio.currentTime = Math.min(targetTime, audio.duration);
      });
      updateProgress(targetTime);
    });
    const activateMasterControl = (control, enabled) => {
      const activate = () => {
        if (!mixer.querySelector("#music-reworks.active")) return;
        if (control.getAttribute("aria-disabled") === "true") return;
        stemState.forEach((_, stem) => setStemEnabled(stem, enabled));
      };
      control.addEventListener("click", activate);
      control.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        activate();
      });
    };
    activateMasterControl(allOnControl, true);
    activateMasterControl(allOffControl, false);
    trackList.addEventListener("click", (event) => {
      const item = event.target.closest("[data-music-folder]");
      if (item) selectTrack(item.dataset.musicFolder);
    });
    trackList.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const item = event.target.closest("[data-music-folder]");
      if (item) selectTrack(item.dataset.musicFolder);
    });
    trackList.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const item = event.target.closest("[data-music-folder]");
      if (!item) return;
      event.preventDefault();
      selectTrack(item.dataset.musicFolder);
    });

    updateOrchestraAvailability();
    progress.disabled = true;
    playButton.disabled = true;
    updateProgress(0);
  };

  const initDeviceModel = () => {
    const canvas = document.querySelector("[data-device-canvas]");
    if (!canvas || !window.THREE) return;

    const { THREE } = window;
    const researchView = canvas.closest(".content-view");
    const thermalSection = canvas.closest("[data-thermal-demo]");
    const stackPage = canvas.closest(".thermal-page-stack");
    const isModelVisible = () => Boolean(
      !document.hidden
      && researchView?.classList.contains("active")
      && thermalSection?.classList.contains("active")
      && stackPage?.classList.contains("is-active")
    );
    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const camera = new THREE.PerspectiveCamera(32, 1, .1, 500);
    const stack = new THREE.Group();
    const INITIAL_STACK_ROTATION = { x: .09, z: -.64 };
    stack.rotation.set(INITIAL_STACK_ROTATION.x, 0, INITIAL_STACK_ROTATION.z);
    scene.add(stack);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x111111, 1.8));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
    keyLight.position.set(-35, -45, 65);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xffffff, .65);
    rimLight.position.set(45, 25, 30);
    scene.add(rimLight);

    const boardGeometry = new THREE.BoxGeometry(65, 30, 1);
    const socGeometry = new THREE.BoxGeometry(15, 15, 1);
    const boardMaterial = new THREE.MeshStandardMaterial({ roughness: .72, metalness: .08, transparent: true, opacity: .24, depthTest: true, depthWrite: false });
    const socMaterial = new THREE.MeshStandardMaterial({ roughness: .5, metalness: .14, emissiveIntensity: .68, transparent: true, opacity: .24, depthTest: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const socWarmMaterial = new THREE.MeshStandardMaterial({ roughness: .53, metalness: .11, emissiveIntensity: .42, transparent: true, opacity: .24, depthTest: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const socCoolMaterial = new THREE.MeshStandardMaterial({ roughness: .56, metalness: .08, emissiveIntensity: .22, transparent: true, opacity: .24, depthTest: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const boardLineMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: .7, depthWrite: false });
    const boardSecondaryLineMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: .12, depthWrite: false });
    const socLineMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 1, depthTest: true, depthWrite: false });
    const socWarmLineMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: .7, depthTest: true, depthWrite: false });
    const socCoolLineMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: .7, depthTest: true, depthWrite: false });
    const tagLineMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: .7, depthTest: false });
    const heatSourceLineMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: .7, depthTest: false, depthWrite: false });
    const tagLabels = [];
    const LAYER_PITCH = 4.6;
    const socThemeColors = {
      green: new THREE.Color(),
      greenLine: new THREE.Color(),
      warm: new THREE.Color(),
      hot: new THREE.Color()
    };
    const animatedHotColor = new THREE.Color();
    const animatedWarmColor = new THREE.Color();
    const animatedHotLineColor = new THREE.Color();
    const animatedWarmLineColor = new THREE.Color();
    let accentSubtleStrength = .12;
    let accentBaseStrength = .24;
    let accentActiveStrength = .7;
    let accentSolidStrength = 1;
    let heatCycleStart = performance.now();

    const createBoardEdgeGeometry = (axis) => {
      const halfWidth = 32.5;
      const halfHeight = 15;
      const halfDepth = .5;
      const points = [];
      const addEdge = (from, to) => points.push(new THREE.Vector3(...from), new THREE.Vector3(...to));

      if (axis === "long") {
        [-halfHeight, halfHeight].forEach((y) => {
          [-halfDepth, halfDepth].forEach((z) => addEdge([-halfWidth, y, z], [halfWidth, y, z]));
        });
      } else {
        [-halfWidth, halfWidth].forEach((x) => {
          [-halfDepth, halfDepth].forEach((z) => addEdge([x, -halfHeight, z], [x, halfHeight, z]));
        });
        [-halfWidth, halfWidth].forEach((x) => {
          [-halfHeight, halfHeight].forEach((y) => addEdge([x, y, -halfDepth], [x, y, halfDepth]));
        });
      }

      return new THREE.BufferGeometry().setFromPoints(points);
    };

    const boardLongEdgeGeometry = createBoardEdgeGeometry("long");
    const boardSecondaryEdgeGeometry = createBoardEdgeGeometry("secondary");

    const createTagLabel = (text, z, index) => {
      const tagZ = (index - 2.5) * LAYER_PITCH;
      const labelCanvas = document.createElement("canvas");
      labelCanvas.width = 432;
      labelCanvas.height = 128;
      const texture = new THREE.CanvasTexture(labelCanvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
      const sprite = new THREE.Sprite(material);
      sprite.position.set(41.5, 0, tagZ);
      sprite.scale.set(12, 3.6, 1);
      sprite.renderOrder = 10;
      scene.add(sprite);

      const boardAnchors = [
        new THREE.Vector3(-32.5, -15, z),
        new THREE.Vector3(32.5, -15, z),
        new THREE.Vector3(32.5, 15, z),
        new THREE.Vector3(-32.5, 15, z)
      ];
      const boardAnchor = new THREE.Vector3(32.5, 0, z);
      const tagAnchor = new THREE.Vector3(36.7, 0, tagZ);
      const connector = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          boardAnchor,
          tagAnchor
        ]),
        tagLineMaterial
      );
      connector.renderOrder = 9;
      scene.add(connector);
      tagLabels.push({ canvas: labelCanvas, texture, text, index, sprite, boardAnchors, tagAnchor, connector, worldAnchor: new THREE.Vector3(), anchorNdcX: 0 });
    };

    for (let index = 0; index < 6; index += 1) {
      const z = (index - 2.5) * LAYER_PITCH;
      const board = new THREE.Mesh(boardGeometry, boardMaterial);
      board.position.z = z;
      stack.add(board);
      const boardLongEdges = new THREE.LineSegments(boardLongEdgeGeometry, boardLineMaterial);
      boardLongEdges.position.z = z;
      stack.add(boardLongEdges);
      const boardSecondaryEdges = new THREE.LineSegments(boardSecondaryEdgeGeometry, boardSecondaryLineMaterial);
      boardSecondaryEdges.position.z = z;
      stack.add(boardSecondaryEdges);

      const thermalBand = Math.min(index, 5 - index);
      const currentSocMaterial = thermalBand === 0 ? socCoolMaterial : thermalBand === 1 ? socWarmMaterial : socMaterial;
      const currentSocLineMaterial = thermalBand === 0 ? socCoolLineMaterial : thermalBand === 1 ? socWarmLineMaterial : socLineMaterial;
      const soc = new THREE.Mesh(socGeometry, currentSocMaterial);
      soc.position.set(0, 0, z + 1.03);
      stack.add(soc);
      const socEdges = new THREE.LineSegments(new THREE.EdgesGeometry(socGeometry), currentSocLineMaterial);
      socEdges.position.copy(soc.position);
      stack.add(socEdges);

      createTagLabel(`Pi ${6 - index}`, z, index);
    }

    const createHeatSourceTag = () => {
      const labelCanvas = document.createElement("canvas");
      labelCanvas.width = 320;
      labelCanvas.height = 192;
      const texture = new THREE.CanvasTexture(labelCanvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
      const sprite = new THREE.Sprite(material);
      sprite.renderOrder = 10;
      scene.add(sprite);

      const sources = Array.from({ length: 6 }, (_, index) => {
        const z = (index - 2.5) * LAYER_PITCH + 1;
        const localAnchors = [
          new THREE.Vector3(-7.5, -7.5, z),
          new THREE.Vector3(-7.5, 7.5, z),
          new THREE.Vector3(7.5, -7.5, z),
          new THREE.Vector3(7.5, 7.5, z)
        ];
        const connector = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
          heatSourceLineMaterial
        );
        connector.renderOrder = 9;
        scene.add(connector);
        return { index, localAnchors, connector, worldAnchor: new THREE.Vector3(), anchorNdcX: Infinity, anchorNdcY: 0 };
      });

      return { canvas: labelCanvas, texture, sprite, sources };
    };

    const heatSourceTag = createHeatSourceTag();

    const cameraElevation = .2;
    let distance = 110;
    let drag = null;
    let returningToDefault = false;
    let lastAnimationTime = performance.now();
    const target = new THREE.Vector3(4, 0, 0);

    const updateTheme = () => {
      const styles = getComputedStyle(document.body);
      const accent = styles.getPropertyValue("--accent").trim();
      const line = accent;
      const muted = styles.getPropertyValue("--muted").trim();
      const thermalWarm = styles.getPropertyValue("--thermal-warm").trim() || accent;
      const thermalHot = styles.getPropertyValue("--thermal-hot").trim() || accent;
      accentSubtleStrength = (parseFloat(styles.getPropertyValue("--accent-subtle-strength")) || 12) / 100;
      accentBaseStrength = (parseFloat(styles.getPropertyValue("--accent-base-strength")) || 24) / 100;
      accentActiveStrength = (parseFloat(styles.getPropertyValue("--accent-active-strength")) || 70) / 100;
      accentSolidStrength = (parseFloat(styles.getPropertyValue("--accent-solid-strength")) || 100) / 100;
      boardMaterial.color.setStyle(accent);
      boardLineMaterial.color.setStyle(line);
      boardSecondaryLineMaterial.color.setStyle(line);
      boardMaterial.opacity = accentBaseStrength;
      boardLineMaterial.opacity = accentActiveStrength;
      boardSecondaryLineMaterial.opacity = accentSubtleStrength;
      socThemeColors.green.setStyle(accent);
      socThemeColors.greenLine.setStyle(line);
      socThemeColors.warm.setStyle(thermalWarm);
      socThemeColors.hot.setStyle(thermalHot);
      socMaterial.color.setStyle(accent);
      socMaterial.emissive.setStyle(accent);
      socLineMaterial.color.setStyle(line);
      socWarmMaterial.color.setStyle(accent);
      socWarmMaterial.emissive.setStyle(accent);
      socWarmLineMaterial.color.setStyle(line);
      socCoolMaterial.color.setStyle(accent);
      socCoolMaterial.emissive.setStyle(accent);
      socCoolLineMaterial.color.setStyle(line);
      [socMaterial, socWarmMaterial, socCoolMaterial].forEach((material) => {
        material.emissiveIntensity = .16;
        material.opacity = accentBaseStrength;
      });
      [socLineMaterial, socWarmLineMaterial, socCoolLineMaterial].forEach((material) => {
        material.opacity = accentActiveStrength;
      });
      tagLineMaterial.color.setStyle(muted);
      heatSourceLineMaterial.color.setStyle(muted);
      tagLineMaterial.opacity = accentActiveStrength;
      heatSourceLineMaterial.opacity = accentActiveStrength;
      tagLabels.forEach(({ canvas: labelCanvas, texture, text }) => {
        const context = labelCanvas.getContext("2d");
        context.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
        context.beginPath();
        context.roundRect(5, 5, labelCanvas.width - 10, labelCanvas.height - 10, 16);
        context.save();
        context.fillStyle = accent;
        context.globalAlpha = accentSubtleStrength;
        context.fill();
        context.restore();
        context.save();
        context.strokeStyle = accent;
        context.lineWidth = 5;
        context.globalAlpha = accentActiveStrength;
        context.stroke();
        context.restore();
        context.fillStyle = muted;
        context.font = '500 51px "IBM Plex Mono", monospace';
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(text, labelCanvas.width / 2, labelCanvas.height / 2 + 1);
        texture.needsUpdate = true;
      });
      {
        const context = heatSourceTag.canvas.getContext("2d");
        context.clearRect(0, 0, heatSourceTag.canvas.width, heatSourceTag.canvas.height);
        context.beginPath();
        context.roundRect(7, 7, heatSourceTag.canvas.width - 14, heatSourceTag.canvas.height - 14, 18);
        context.save();
        context.fillStyle = accent;
        context.globalAlpha = accentSubtleStrength;
        context.fill();
        context.restore();
        context.save();
        context.strokeStyle = accent;
        context.lineWidth = 5;
        context.globalAlpha = accentActiveStrength;
        context.stroke();
        context.restore();
        context.fillStyle = muted;
        context.font = '500 50px "IBM Plex Mono", monospace';
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText("HEAT", heatSourceTag.canvas.width / 2, 66);
        context.fillText("SOURCES", heatSourceTag.canvas.width / 2, 130);
        heatSourceTag.texture.needsUpdate = true;
      }
    };

    const updateHeatAnimation = (time) => {
      const cycle = Math.max(0, (time - heatCycleStart) * .001 % 7.2);
      const smoothstep = (value) => value * value * (3 - 2 * value);
      let heat = 0;
      if (cycle >= .7 && cycle < 3.8) heat = smoothstep((cycle - .7) / 3.1);
      else if (cycle >= 3.8 && cycle < 6) heat = 1;
      else if (cycle >= 6) heat = 1 - smoothstep((cycle - 6) / 1.2);

      animatedHotColor.copy(socThemeColors.green).lerp(socThemeColors.hot, heat);
      animatedWarmColor.copy(socThemeColors.green).lerp(socThemeColors.warm, heat);
      animatedHotLineColor.copy(socThemeColors.greenLine).lerp(socThemeColors.hot, heat);
      animatedWarmLineColor.copy(socThemeColors.greenLine).lerp(socThemeColors.warm, heat);

      socMaterial.color.copy(animatedHotColor);
      socMaterial.emissive.copy(animatedHotColor);
      socLineMaterial.color.copy(animatedHotLineColor);
      socWarmMaterial.color.copy(animatedWarmColor);
      socWarmMaterial.emissive.copy(animatedWarmColor);
      socWarmLineMaterial.color.copy(animatedWarmLineColor);
      socCoolMaterial.color.copy(socThemeColors.green);
      socCoolMaterial.emissive.copy(socThemeColors.green);
      socCoolLineMaterial.color.copy(socThemeColors.greenLine);

      socMaterial.emissiveIntensity = .16 + heat * 1.02;
      socMaterial.opacity = accentBaseStrength + heat * (accentActiveStrength - accentBaseStrength);
      socLineMaterial.opacity = accentActiveStrength + heat * (accentSolidStrength - accentActiveStrength);
      socWarmMaterial.emissiveIntensity = .16 + heat * .5;
      socWarmMaterial.opacity = accentBaseStrength + heat * (accentActiveStrength - accentBaseStrength);
      socWarmLineMaterial.opacity = accentActiveStrength + heat * (accentSolidStrength - accentActiveStrength);
      socCoolMaterial.emissiveIntensity = .16 + heat * .06;
      socCoolMaterial.opacity = accentBaseStrength;
      socCoolLineMaterial.opacity = accentActiveStrength;
    };

    const render = () => {
      const horizontal = Math.cos(cameraElevation) * distance;
      camera.position.set(target.x, -horizontal, Math.sin(cameraElevation) * distance);
      camera.lookAt(target);
      camera.updateMatrixWorld(true);
      stack.updateMatrixWorld(true);
      heatSourceTag.sources.forEach((source) => {
        source.anchorNdcX = Infinity;
        source.localAnchors.forEach((anchor) => {
          const candidate = anchor.clone().applyMatrix4(stack.matrixWorld);
          const projected = candidate.clone().project(camera);
          if (projected.x >= source.anchorNdcX) return;
          source.anchorNdcX = projected.x;
          source.anchorNdcY = projected.y;
          source.worldAnchor.copy(candidate);
        });
      });
      let leftmostBoardNdcX = Infinity;
      tagLabels.forEach((label) => {
        label.anchorNdcX = -Infinity;
        label.boardAnchors.forEach((anchor) => {
          const candidate = anchor.clone().applyMatrix4(stack.matrixWorld);
          const candidateNdcX = candidate.clone().project(camera).x;
          leftmostBoardNdcX = Math.min(leftmostBoardNdcX, candidateNdcX);
          if (candidateNdcX <= label.anchorNdcX) return;
          label.anchorNdcX = candidateNdcX;
          label.worldAnchor.copy(candidate);
        });
      });
      const orderedLabels = [...tagLabels].sort((first, second) => second.index - first.index);
      const tagWidthPixels = Math.max(96, Math.min(120, canvas.clientWidth * .12));
      const tagHeightPixels = tagWidthPixels * .3;
      const tagGapPixels = 7;
      const tagWidthNdc = tagWidthPixels * 2 / Math.max(1, canvas.clientWidth);
      const rightmostBoardNdcX = Math.max(...tagLabels.map((label) => label.anchorNdcX));
      const boardNormal = new THREE.Vector3(1, 0, 0).applyQuaternion(stack.quaternion);
      const sideViewFactor = 1 - Math.abs(boardNormal.x);
      const dynamicGapPixels = 18 + sideViewFactor * 32;
      const dynamicGapNdc = dynamicGapPixels * 2 / Math.max(1, canvas.clientWidth);
      const unclampedTagColumnNdcX = rightmostBoardNdcX + dynamicGapNdc + tagWidthNdc / 2;
      const tagColumnNdcX = Math.min(.96 - tagWidthNdc / 2, unclampedTagColumnNdcX);
      const stackCenterNdcY = new THREE.Vector3(0, 0, 0).applyMatrix4(stack.matrixWorld).project(camera).y;
      const tagStepNdcY = (tagHeightPixels + tagGapPixels) * 2 / Math.max(1, canvas.clientHeight);
      const tagColumnHalfNdcHeight = ((orderedLabels.length - 1) * (tagHeightPixels + tagGapPixels) + tagHeightPixels) / Math.max(1, canvas.clientHeight);
      const tagColumnCenterNdcY = Math.max(-.96 + tagColumnHalfNdcHeight, Math.min(.96 - tagColumnHalfNdcHeight, stackCenterNdcY));
      const tagPlaneNdcZ = new THREE.Vector3(target.x, target.y, target.z).project(camera).z;
      orderedLabels.forEach(({ sprite, tagAnchor, connector, worldAnchor }, index) => {
        const tagCenterNdcY = tagColumnCenterNdcY + ((orderedLabels.length - 1) / 2 - index) * tagStepNdcY;
        const alignedCenter = new THREE.Vector3(tagColumnNdcX, tagCenterNdcY, tagPlaneNdcZ).unproject(camera);
        const alignedLeft = new THREE.Vector3(tagColumnNdcX - tagWidthNdc / 2, tagCenterNdcY, tagPlaneNdcZ).unproject(camera);
        const alignedRight = new THREE.Vector3(tagColumnNdcX + tagWidthNdc / 2, tagCenterNdcY, tagPlaneNdcZ).unproject(camera);
        const alignedWidth = alignedLeft.distanceTo(alignedRight);
        sprite.position.copy(alignedCenter);
        sprite.scale.set(alignedWidth, alignedWidth * .3, 1);
        tagAnchor.copy(alignedLeft);
        const positions = connector.geometry.getAttribute("position");
        positions.setXYZ(0, worldAnchor.x, worldAnchor.y, worldAnchor.z);
        positions.setXYZ(1, tagAnchor.x, tagAnchor.y, tagAnchor.z);
        positions.needsUpdate = true;
        connector.geometry.computeBoundingSphere();
      });

      const heatTagWidthPixels = Math.max(76, Math.min(92, canvas.clientWidth * .1));
      const heatTagHeightPixels = heatTagWidthPixels * .6;
      const heatTagWidthNdc = heatTagWidthPixels * 2 / Math.max(1, canvas.clientWidth);
      const heatGapNdc = 16 * 2 / Math.max(1, canvas.clientWidth);
      const heatTagColumnNdcX = Math.max(-.96 + heatTagWidthNdc / 2, leftmostBoardNdcX - heatGapNdc - heatTagWidthNdc / 2);
      const heatTagCenterNdcY = heatSourceTag.sources.reduce((sum, source) => sum + source.anchorNdcY, 0) / heatSourceTag.sources.length;
      const heatTagCenter = new THREE.Vector3(heatTagColumnNdcX, heatTagCenterNdcY, tagPlaneNdcZ).unproject(camera);
      const heatTagLeft = new THREE.Vector3(heatTagColumnNdcX - heatTagWidthNdc / 2, heatTagCenterNdcY, tagPlaneNdcZ).unproject(camera);
      const heatTagRight = new THREE.Vector3(heatTagColumnNdcX + heatTagWidthNdc / 2, heatTagCenterNdcY, tagPlaneNdcZ).unproject(camera);
      const heatTagWorldWidth = heatTagLeft.distanceTo(heatTagRight);
      heatSourceTag.sprite.position.copy(heatTagCenter);
      heatSourceTag.sprite.scale.set(heatTagWorldWidth, heatTagWorldWidth * .6, 1);
      const heatPortStepNdc = (heatTagHeightPixels / 7) * 2 / Math.max(1, canvas.clientHeight);
      heatSourceTag.sources.forEach((source) => {
        const portNdcY = heatTagCenterNdcY + (source.index - 2.5) * heatPortStepNdc;
        const tagPort = new THREE.Vector3(heatTagColumnNdcX + heatTagWidthNdc / 2, portNdcY, tagPlaneNdcZ).unproject(camera);
        const positions = source.connector.geometry.getAttribute("position");
        positions.setXYZ(0, source.worldAnchor.x, source.worldAnchor.y, source.worldAnchor.z);
        positions.setXYZ(1, tagPort.x, tagPort.y, tagPort.z);
        positions.needsUpdate = true;
        source.connector.geometry.computeBoundingSphere();
      });
      renderer.render(scene, camera);
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / rect.height;
      const verticalFov = THREE.MathUtils.degToRad(camera.fov);
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
      const stackRadius = 48;
      distance = stackRadius / Math.sin(Math.min(verticalFov, horizontalFov) / 2) * .68;
      camera.updateProjectionMatrix();
      if (isModelVisible()) render();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    document.addEventListener("sectionthemechange", () => {
      updateTheme();
      if (isModelVisible()) render();
    });
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
      updateTheme();
      if (isModelVisible()) render();
    });
    const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const beginReturnToDefault = () => {
      drag = null;
      if (reduceMotionQuery.matches) {
        stack.rotation.set(INITIAL_STACK_ROTATION.x, 0, INITIAL_STACK_ROTATION.z);
        if (isModelVisible()) render();
        return;
      }
      returningToDefault = true;
    };
    canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      returningToDefault = false;
      drag = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!drag) return;
      stack.rotation.z += (event.clientX - drag.x) * .003;
      stack.rotation.x += (event.clientY - drag.y) * .003;
      drag = { x: event.clientX, y: event.clientY };
      if (isModelVisible()) render();
    });
    canvas.addEventListener("pointerup", beginReturnToDefault);
    canvas.addEventListener("pointercancel", beginReturnToDefault);

    let heatFrame = 0;
    const animateHeat = (time) => {
      heatFrame = 0;
      if (!isModelVisible()) return;
      const deltaTime = Math.min(.05, Math.max(0, (time - lastAnimationTime) / 1000));
      lastAnimationTime = time;
      let needsRender = false;
      if (!reduceMotionQuery.matches) {
        updateHeatAnimation(time);
        needsRender = true;
      }
      if (returningToDefault) {
        const blend = 1 - Math.exp(-4.6 * deltaTime);
        const deltaX = Math.atan2(
          Math.sin(INITIAL_STACK_ROTATION.x - stack.rotation.x),
          Math.cos(INITIAL_STACK_ROTATION.x - stack.rotation.x)
        );
        const deltaZ = Math.atan2(
          Math.sin(INITIAL_STACK_ROTATION.z - stack.rotation.z),
          Math.cos(INITIAL_STACK_ROTATION.z - stack.rotation.z)
        );
        stack.rotation.x += deltaX * blend;
        stack.rotation.z += deltaZ * blend;
        if (Math.abs(deltaX) < .001 && Math.abs(deltaZ) < .001) {
          stack.rotation.set(INITIAL_STACK_ROTATION.x, 0, INITIAL_STACK_ROTATION.z);
          returningToDefault = false;
        }
        needsRender = true;
      }
      if (needsRender) render();
      heatFrame = window.requestAnimationFrame(animateHeat);
    };

    const stopHeatAnimation = () => {
      if (heatFrame) window.cancelAnimationFrame(heatFrame);
      heatFrame = 0;
      drag = null;
      returningToDefault = false;
    };

    const startHeatAnimation = () => {
      if (heatFrame || !isModelVisible()) return;
      const startTime = performance.now();
      drag = null;
      returningToDefault = false;
      heatCycleStart = startTime;
      lastAnimationTime = startTime;
      stack.rotation.set(INITIAL_STACK_ROTATION.x, 0, INITIAL_STACK_ROTATION.z);
      updateHeatAnimation(startTime);
      resize();
      render();
      if (!reduceMotionQuery.matches) heatFrame = window.requestAnimationFrame(animateHeat);
    };

    const syncHeatAnimation = () => {
      if (isModelVisible()) startHeatAnimation();
      else stopHeatAnimation();
    };
    const visibilityObserver = new MutationObserver(syncHeatAnimation);
    [researchView, thermalSection, stackPage].filter(Boolean).forEach((element) => {
      visibilityObserver.observe(element, { attributes: true, attributeFilter: ["class"] });
    });
    document.addEventListener("visibilitychange", syncHeatAnimation);
    updateTheme();
    resize();
    syncHeatAnimation();
    return;

    {
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const vertices = [
      [-2.1667, -1, -.0333], [2.1667, -1, -.0333], [2.1667, 1, -.0333], [-2.1667, 1, -.0333],
      [-2.1667, -1, .0333], [2.1667, -1, .0333], [2.1667, 1, .0333], [-2.1667, 1, .0333]
    ];
    // 15 × 15 × 1 mm SoC, centered on the board.
    const socVertices = [
      [-.5, -.5, .0343], [.5, -.5, .0343], [.5, .5, .0343], [-.5, .5, .0343],
      [-.5, -.5, .101], [.5, -.5, .101], [.5, .5, .101], [-.5, .5, .101]
    ];
    // One model unit is 15 mm. A layer pitch of 0.2333 is 3.5 mm:
    // 1 mm board + 1 mm SoC + 1.5 mm clearance to the board above.
    const stackOffsets = Array.from({ length: 6 }, (_, index) => (index - 2.5) * .2333);
    const offsetModel = (model, zOffset) => model.map(([x, y, z]) => [x, y, z + zOffset]);
    const models = stackOffsets.flatMap((zOffset) => [
      { type: "board", vertices: offsetModel(vertices, zOffset) },
      { type: "soc", vertices: offsetModel(socVertices, zOffset) }
    ]);
    const faces = [[0, 1, 2, 3], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0], [4, 7, 6, 5]];
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    let rotationX = 1.34;
    let rotationY = 0;
    let drag = null;

    const withAlpha = (color, alpha) => color.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
    const rotate = ([x, y, z]) => {
      const cosY = Math.cos(rotationY);
      const sinY = Math.sin(rotationY);
      const cosX = Math.cos(rotationX);
      const sinX = Math.sin(rotationX);
      const x1 = x * cosY - z * sinY;
      const z1 = x * sinY + z * cosY;
      return [x1, y * cosX - z1 * sinX, y * sinX + z1 * cosX];
    };

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(rect.width * pixelRatio));
      const height = Math.max(1, Math.round(rect.height * pixelRatio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);

      const styles = getComputedStyle(document.body);
      const accent = styles.getPropertyValue("--accent").trim();
      const line = accent;
      const thermalHot = styles.getPropertyValue("--thermal-hot").trim() || accent;
      const activeStrength = (parseFloat(styles.getPropertyValue("--accent-active-strength")) || 70) / 100;
      const solidStrength = (parseFloat(styles.getPropertyValue("--accent-solid-strength")) || 100) / 100;
      const scale = Math.min(rect.width / 10.6, rect.height / 3.4);
      const project = ([x, y, z]) => {
        const perspective = 4.8 / (4.8 - z);
        return [rect.width * .5 + x * scale * perspective, rect.height * .52 + y * scale * perspective];
      };
      const modelStates = models.map((model) => ({
        ...model,
        rotated: model.vertices.map(rotate)
      })).map((model) => ({
        ...model,
        points: model.rotated.map(project),
        depth: model.rotated.reduce((sum, point) => sum + point[2], 0) / model.rotated.length
      })).sort((left, right) => left.depth - right.depth);

      const drawEdges = (modelPoints, stroke, width) => {
        context.strokeStyle = stroke;
        context.lineWidth = width;
        edges.forEach(([from, to]) => {
          context.beginPath();
          context.moveTo(...modelPoints[from]);
          context.lineTo(...modelPoints[to]);
          context.stroke();
        });
      };

      context.lineJoin = "miter";
      modelStates.forEach((model) => {
        const orderedFaces = faces
          .map((face) => ({ face, depth: face.reduce((sum, index) => sum + model.rotated[index][2], 0) / face.length }))
          .sort((left, right) => left.depth - right.depth);
        orderedFaces.forEach(({ face, depth }) => {
          context.beginPath();
          face.forEach((index, order) => {
            const [x, y] = model.points[index];
            if (order) context.lineTo(x, y);
            else context.moveTo(x, y);
          });
          context.closePath();
          context.fillStyle = model.type === "soc"
            ? withAlpha(thermalHot, depth > model.depth ? solidStrength : activeStrength)
            : withAlpha(accent, solidStrength);
          context.fill();
        });
        drawEdges(model.points, model.type === "soc" ? withAlpha(thermalHot, solidStrength) : line, model.type === "soc" ? 1.5 : 1.7);
      });
    };

    const resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(canvas);
    document.addEventListener("sectionthemechange", draw);
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", draw);
    canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      drag = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!drag) return;
      rotationY -= (event.clientX - drag.x) * .004;
      rotationX -= (event.clientY - drag.y) * .004;
      rotationX = Math.max(-3.12, Math.min(3.12, rotationX));
      drag = { x: event.clientX, y: event.clientY };
      draw();
    });
    const releasePointer = () => { drag = null; };
    canvas.addEventListener("pointerup", releasePointer);
    canvas.addEventListener("pointercancel", releasePointer);
    draw();
    }
  };

  const initMarsbotModel = () => {
    const canvas = document.querySelector("[data-marsbot-canvas]");
    if (!canvas || !window.THREE) return;

    const { THREE } = window;
    const researchView = canvas.closest(".content-view");
    const roboticsSection = canvas.closest("#research-robotics");
    const roboticsPage = canvas.closest("[data-research-subpage]");
    const isVisible = () => Boolean(
      !document.hidden
      && researchView?.classList.contains("active")
      && roboticsSection?.classList.contains("active")
      && roboticsPage?.classList.contains("is-active")
    );

    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const camera = new THREE.PerspectiveCamera(30, 1, .1, 500);
    const target = new THREE.Vector3(0, 0, 0);
    camera.position.set(0, -141, 100);
    camera.lookAt(target);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x111111, 1.65));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.75);
    keyLight.position.set(-50, -70, 110);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xffffff, .7);
    rimLight.position.set(75, 35, 55);
    scene.add(rimLight);

    const robot = new THREE.Group();
    const INITIAL_ROBOT_ROTATION = { x: 0, z: -Math.PI / 4 };
    robot.rotation.set(INITIAL_ROBOT_ROTATION.x, 0, INITIAL_ROBOT_ROTATION.z);
    scene.add(robot);
    const chassis = new THREE.Group();
    robot.add(chassis);

    const surfaceMaterials = [];
    const lineMaterials = [];
    const makeSurface = (opacity, metalness = .08, roughness = .66) => {
      const material = new THREE.MeshStandardMaterial({
        transparent: true,
        opacity,
        metalness,
        roughness,
        depthWrite: true,
        side: THREE.DoubleSide
      });
      surfaceMaterials.push({ material, opacity });
      return material;
    };
    const makeLine = (opacity) => {
      const material = new THREE.LineBasicMaterial({ transparent: true, opacity });
      lineMaterials.push({ material, opacity });
      return material;
    };

    const structureMaterial = makeSurface(.24, .05, .72);
    structureMaterial.depthWrite = false;
    const boardMaterial = makeSurface(.18, .12, .62);
    const componentMaterial = makeSurface(.42, .16, .5);
    const motorMaterial = makeSurface(.5, .62, .3);
    const lensMaterial = makeSurface(.7, .22, .26);
    const glassMaterial = new THREE.MeshStandardMaterial({
      color: 0x101615,
      emissive: 0x000000,
      roughness: .12,
      metalness: .34,
      transparent: true,
      opacity: .96
    });
    const legMaterial = makeSurface(.58, .04, .78);
    const structureLine = makeLine(.7);
    const secondaryLine = makeLine(.24);
    const solidLine = makeLine(1);

    const addEdges = (mesh, material = structureLine, threshold = 20) => {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, threshold), material);
      mesh.add(edges);
      return mesh;
    };
    const addBox = (size, position, material, edgeMaterial = structureLine) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
      mesh.position.set(...position);
      addEdges(mesh, edgeMaterial);
      chassis.add(mesh);
      return mesh;
    };
    const addCylinder = (radius, depth, position, rotation, material, edgeMaterial = structureLine, segments = 28) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, segments), material);
      mesh.position.set(...position);
      mesh.rotation.set(...rotation);
      addEdges(mesh, edgeMaterial);
      chassis.add(mesh);
      return mesh;
    };

    addBox([74, 42, 4], [0, 0, 0], structureMaterial, structureLine);

    // Compact camera: body, lens barrel, ring and glass share one optical axis.
    // That axis continues directly toward the center of the motor.
    addBox([7, 18, 21.5], [-22, 0, 12.75], boardMaterial, structureLine);
    addCylinder(4.8, 3, [-17, 0, 18], [0, 0, -Math.PI / 2], lensMaterial, solidLine, 32);
    addCylinder(3.6, 1.8, [-14.6, 0, 18], [0, 0, -Math.PI / 2], componentMaterial, solidLine, 32);
    addCylinder(2.35, 1, [-13.2, 0, 18], [0, 0, -Math.PI / 2], glassMaterial, solidLine, 28);

    addCylinder(5.4, 22, [20, 0, 7.4], [0, 0, Math.PI / 2], motorMaterial, solidLine, 32);
    addCylinder(1.7, 7, [34.5, 0, 7.4], [0, 0, Math.PI / 2], motorMaterial, solidLine, 20);

    const rotorGroup = new THREE.Group();
    rotorGroup.position.set(38, 0, 7.4);
    const rotorGeometry = new THREE.CylinderGeometry(4.35, 4.35, 2.8, 32, 1, false, 0, Math.PI);
    const rotor = new THREE.Mesh(rotorGeometry, componentMaterial);
    rotor.rotation.z = Math.PI / 2;
    addEdges(rotor, solidLine);
    rotorGroup.add(rotor);
    chassis.add(rotorGroup);

    const legGeometry = new THREE.CylinderGeometry(1.5, 1.9, 23, 12);
    const legAxis = new THREE.Vector3(0, 1, 0);
    const legs = [];
    const placeLegSegment = (segment, from, to) => {
      const vector = to.clone().sub(from);
      segment.position.copy(from).add(to).multiplyScalar(.5);
      segment.quaternion.setFromUnitVectors(legAxis, vector.clone().normalize());
      segment.scale.y = vector.length() / 23;
    };
    const makeLeg = (x, y, direction) => {
      const start = new THREE.Vector3(x, y, -2);
      const end = new THREE.Vector3(x - 6, y + direction * 1.5, -25);
      const mesh = new THREE.Mesh(legGeometry, legMaterial);
      robot.add(mesh);
      placeLegSegment(mesh, start, end);
      legs.push({ start, end, mesh, naturalLength: start.distanceTo(end) });
    };
    [-23, 0, 23].forEach((x) => {
      makeLeg(x, -16, -1);
      makeLeg(x, 16, 1);
    });

    const tagLineMaterial = makeLine(.7);
    tagLineMaterial.depthTest = false;
    tagLineMaterial.depthWrite = false;
    const marsbotTags = [];
    const createMarsbotTag = (text, anchorGetters, layoutAnchor, offset) => {
      const labelCanvas = document.createElement("canvas");
      labelCanvas.width = 400;
      labelCanvas.height = 112;
      const texture = new THREE.CanvasTexture(labelCanvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
      const sprite = new THREE.Sprite(material);
      sprite.renderOrder = 10;
      scene.add(sprite);
      const connectors = anchorGetters.map(() => {
        const connector = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
          tagLineMaterial
        );
        connector.renderOrder = 9;
        scene.add(connector);
        return connector;
      });
      marsbotTags.push({ text, anchorGetters, layoutAnchor, offset, labelCanvas, texture, sprite, connectors });
    };
    const elasticLegLayoutAnchor = legs[4].start.clone().lerp(legs[4].end, .5);
    createMarsbotTag(
      "CAMERA",
      [() => new THREE.Vector3(-17, 0, 18).applyMatrix4(chassis.matrixWorld)],
      () => new THREE.Vector3(-17, 0, 18).applyMatrix4(robot.matrixWorld),
      { x: -.3, y: .25 }
    );
    createMarsbotTag(
      "MOTOR",
      [() => new THREE.Vector3(20, 0, 12.8).applyMatrix4(chassis.matrixWorld)],
      () => new THREE.Vector3(20, 0, 12.8).applyMatrix4(robot.matrixWorld),
      { x: .3, y: .22 }
    );
    createMarsbotTag(
      "ECCENTRIC ROTOR",
      [() => new THREE.Vector3(38, 0, 7.4).applyMatrix4(chassis.matrixWorld)],
      () => new THREE.Vector3(38, 0, 7.4).applyMatrix4(robot.matrixWorld),
      { x: .32, y: .02 }
    );
    createMarsbotTag(
      "ELASTIC LEGS",
      legs.map((leg) => () => leg.mesh.getWorldPosition(new THREE.Vector3())),
      () => elasticLegLayoutAnchor.clone().applyMatrix4(robot.matrixWorld),
      { x: .32, y: -.2 }
    );
    const marsbotBoundsCorners = [];
    [-37, 41].forEach((x) => {
      [-21, 21].forEach((y) => {
        [-25, 23.5].forEach((z) => marsbotBoundsCorners.push(new THREE.Vector3(x, y, z)));
      });
    });

    let drag = null;
    let returningToDefault = false;
    let wasVisible = false;
    let rotorAngle = 0;
    let lastTime = performance.now();
    const rearPivot = new THREE.Vector3(-23, 0, -2);
    const rotatedRearPivot = new THREE.Vector3();
    const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateTheme = () => {
      const styles = getComputedStyle(document.body);
      const accent = styles.getPropertyValue("--accent").trim();
      const muted = styles.getPropertyValue("--muted").trim();
      const subtle = (parseFloat(styles.getPropertyValue("--accent-subtle-strength")) || 12) / 100;
      const base = (parseFloat(styles.getPropertyValue("--accent-base-strength")) || 24) / 100;
      const active = (parseFloat(styles.getPropertyValue("--accent-active-strength")) || 70) / 100;
      const solid = (parseFloat(styles.getPropertyValue("--accent-solid-strength")) || 100) / 100;
      const opacityMap = new Map([[.18, subtle], [.24, base], [.42, active * .68], [.5, active], [.58, active], [.7, solid]]);
      surfaceMaterials.forEach(({ material, opacity }) => {
        material.color.setStyle(accent);
        material.emissive.setStyle(accent);
        material.emissiveIntensity = opacity >= .58 ? .08 : .025;
        material.opacity = opacityMap.get(opacity) ?? opacity;
      });
      lineMaterials.forEach(({ material, opacity }) => {
        material.color.setStyle(opacity >= 1 ? accent : opacity <= .24 ? muted : accent);
        material.opacity = opacity >= 1 ? solid : opacity <= .24 ? base : active;
      });
      tagLineMaterial.color.setStyle(muted);
      tagLineMaterial.opacity = active;
      glassMaterial.emissive.setStyle(accent);
      glassMaterial.emissiveIntensity = .08;
      marsbotTags.forEach(({ labelCanvas, texture, text }) => {
        const context = labelCanvas.getContext("2d");
        context.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
        context.beginPath();
        context.roundRect(5, 5, labelCanvas.width - 10, labelCanvas.height - 10, 16);
        context.save();
        context.fillStyle = accent;
        context.globalAlpha = subtle;
        context.fill();
        context.restore();
        context.save();
        context.strokeStyle = accent;
        context.lineWidth = 5;
        context.globalAlpha = active;
        context.stroke();
        context.restore();
        context.fillStyle = muted;
        context.font = '500 50px "IBM Plex Mono", monospace';
        context.textAlign = "center";
        context.textBaseline = "middle";
        const lines = text === "ECCENTRIC ROTOR" ? ["ECCENTRIC", "ROTOR"] : [text];
        const lineHeight = 44;
        lines.forEach((line, index) => {
          const lineY = labelCanvas.height / 2 + 1 + (index - (lines.length - 1) / 2) * lineHeight;
          context.fillText(line, labelCanvas.width / 2, lineY);
        });
        texture.needsUpdate = true;
      });
    };

    const resize = () => {
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      const pixelRatio = renderer.getPixelRatio();
      if (canvas.width !== Math.round(width * pixelRatio) || canvas.height !== Math.round(height * pixelRatio)) {
        renderer.setSize(width, height, false);
      }
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const render = (time) => {
      window.requestAnimationFrame(render);
      const modelVisible = isVisible();
      if (!modelVisible) {
        wasVisible = false;
        lastTime = time;
        return;
      }
      if (!wasVisible) {
        wasVisible = true;
        drag = null;
        returningToDefault = false;
        robot.rotation.set(INITIAL_ROBOT_ROTATION.x, 0, INITIAL_ROBOT_ROTATION.z);
      }
      resize();
      const delta = Math.min(40, Math.max(0, time - lastTime));
      const deltaTime = Math.min(.05, delta / 1000);
      lastTime = time;
      if (!reduceMotion) rotorAngle += delta * .04;
      const rockingPhase = reduceMotion ? 0 : time * .04;
      const tilt = reduceMotion ? 0 : Math.sin(rockingPhase) * .004;
      chassis.rotation.set(0, tilt, 0);
      rotatedRearPivot.copy(rearPivot).applyQuaternion(chassis.quaternion);
      chassis.position.copy(rearPivot).sub(rotatedRearPivot);
      legs.forEach((leg) => {
        const animatedStart = leg.start.clone().applyQuaternion(chassis.quaternion).add(chassis.position);
        const distanceFromRear = Math.max(0, (leg.start.x - rearPivot.x) / 46);
        const animatedEnd = leg.end.clone();
        const stretchedLength = animatedStart.distanceTo(animatedEnd);
        if (stretchedLength > leg.naturalLength) {
          const releasedEnd = animatedStart.clone().add(
            animatedEnd.clone().sub(animatedStart).normalize().multiplyScalar(leg.naturalLength)
          );
          animatedEnd.lerp(releasedEnd, Math.pow(distanceFromRear, 1.8));
        }
        placeLegSegment(leg.mesh, animatedStart, animatedEnd);
      });
      if (returningToDefault) {
        const blend = 1 - Math.exp(-4.6 * deltaTime);
        const deltaX = Math.atan2(
          Math.sin(INITIAL_ROBOT_ROTATION.x - robot.rotation.x),
          Math.cos(INITIAL_ROBOT_ROTATION.x - robot.rotation.x)
        );
        const deltaZ = Math.atan2(
          Math.sin(INITIAL_ROBOT_ROTATION.z - robot.rotation.z),
          Math.cos(INITIAL_ROBOT_ROTATION.z - robot.rotation.z)
        );
        robot.rotation.x += deltaX * blend;
        robot.rotation.z += deltaZ * blend;
        if (Math.abs(deltaX) < .001 && Math.abs(deltaZ) < .001) {
          robot.rotation.set(INITIAL_ROBOT_ROTATION.x, 0, INITIAL_ROBOT_ROTATION.z);
          returningToDefault = false;
        }
      }
      rotorGroup.rotation.x = rotorAngle;
      camera.updateMatrixWorld(true);
      robot.updateMatrixWorld(true);
      const tagWidthPixels = Math.max(92, Math.min(116, canvas.clientWidth * .18));
      const tagWidthNdc = tagWidthPixels * 2 / Math.max(1, canvas.clientWidth);
      const tagHeightNdc = tagWidthPixels * .28 * 2 / Math.max(1, canvas.clientHeight);
      const tagGapNdc = 18 * 2 / Math.max(1, canvas.clientWidth);
      const tagPlaneNdcZ = target.clone().project(camera).z;
      let modelMinNdcX = Infinity;
      let modelMaxNdcX = -Infinity;
      marsbotBoundsCorners.forEach((corner) => {
        const projected = corner.clone().applyMatrix4(robot.matrixWorld).project(camera);
        modelMinNdcX = Math.min(modelMinNdcX, projected.x);
        modelMaxNdcX = Math.max(modelMaxNdcX, projected.x);
      });
      const leftTagColumnNdcX = Math.max(-.93 + tagWidthNdc / 2, modelMinNdcX - tagGapNdc - tagWidthNdc / 2);
      const rightTagColumnNdcX = Math.min(.93 - tagWidthNdc / 2, modelMaxNdcX + tagGapNdc + tagWidthNdc / 2);
      const tagLayouts = marsbotTags.map((tag) => {
        const worldAnchors = tag.anchorGetters.map((getAnchor) => getAnchor());
        const projectedAnchor = tag.layoutAnchor().project(camera);
        return {
          tag,
          worldAnchors,
          centerNdcX: tag.offset.x < 0 ? leftTagColumnNdcX : rightTagColumnNdcX,
          centerNdcY: Math.max(-.9, Math.min(.9, projectedAnchor.y + tag.offset.y))
        };
      });
      [-1, 1].forEach((side) => {
        const column = tagLayouts
          .filter(({ tag }) => Math.sign(tag.offset.x) === side)
          .sort((first, second) => second.centerNdcY - first.centerNdcY);
        const minimumStep = tagHeightNdc + .035;
        for (let index = 1; index < column.length; index += 1) {
          column[index].centerNdcY = Math.min(column[index].centerNdcY, column[index - 1].centerNdcY - minimumStep);
        }
        if (column.length && column[column.length - 1].centerNdcY < -.9) {
          const shift = -.9 - column[column.length - 1].centerNdcY;
          column.forEach((layout) => { layout.centerNdcY += shift; });
        }
        if (column.length && column[0].centerNdcY > .9) {
          const shift = column[0].centerNdcY - .9;
          column.forEach((layout) => { layout.centerNdcY -= shift; });
        }
      });
      tagLayouts.forEach(({ tag: { offset, sprite, connectors }, worldAnchors, centerNdcX, centerNdcY }) => {
        const center = new THREE.Vector3(centerNdcX, centerNdcY, tagPlaneNdcZ).unproject(camera);
        const left = new THREE.Vector3(centerNdcX - tagWidthNdc / 2, centerNdcY, tagPlaneNdcZ).unproject(camera);
        const right = new THREE.Vector3(centerNdcX + tagWidthNdc / 2, centerNdcY, tagPlaneNdcZ).unproject(camera);
        const width = left.distanceTo(right);
        sprite.position.copy(center);
        sprite.scale.set(width, width * .28, 1);
        connectors.forEach((connector, index) => {
          const portNdcX = offset.x < 0 ? centerNdcX + tagWidthNdc / 2 : centerNdcX - tagWidthNdc / 2;
          const tagPort = new THREE.Vector3(portNdcX, centerNdcY, tagPlaneNdcZ).unproject(camera);
          const worldAnchor = worldAnchors[index];
          const positions = connector.geometry.getAttribute("position");
          positions.setXYZ(0, worldAnchor.x, worldAnchor.y, worldAnchor.z);
          positions.setXYZ(1, tagPort.x, tagPort.y, tagPort.z);
          positions.needsUpdate = true;
          connector.geometry.computeBoundingSphere();
        });
      });
      renderer.render(scene, camera);
    };

    const beginReturnToDefault = () => {
      drag = null;
      if (reduceMotionQuery.matches) {
        robot.rotation.set(INITIAL_ROBOT_ROTATION.x, 0, INITIAL_ROBOT_ROTATION.z);
        return;
      }
      returningToDefault = true;
    };
    canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      returningToDefault = false;
      drag = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!drag) return;
      robot.rotation.z += (event.clientX - drag.x) * .003;
      robot.rotation.x += (event.clientY - drag.y) * .003;
      drag = { x: event.clientX, y: event.clientY };
    });
    canvas.addEventListener("pointerup", beginReturnToDefault);
    canvas.addEventListener("pointercancel", beginReturnToDefault);
    document.addEventListener("sectionthemechange", updateTheme);
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", updateTheme);
    new ResizeObserver(resize).observe(canvas);
    updateTheme();
    window.requestAnimationFrame(render);
  };

  const initCrackInspectionDemo = () => {
    const canvas = document.querySelector("[data-crack-pipeline]");
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const researchView = canvas.closest(".content-view");
    const roboticsSection = canvas.closest("#research-robotics");
    const roboticsPage = canvas.closest("[data-research-subpage]");
    const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const isVisible = () => Boolean(
      !document.hidden
      && researchView?.classList.contains("active")
      && roboticsSection?.classList.contains("active")
      && roboticsPage?.classList.contains("is-active")
    );
    const palette = { accent: "#4eda7a", muted: "#888", line: "#888", crack: "#222" };
    const crackMask = new Image();
    const crackTint = document.createElement("canvas");
    const crackTintContext = crackTint.getContext("2d");
    const wallTexture = new Image();
    const sobelCanvas = document.createElement("canvas");
    const concreteSpeckles = Array.from({ length: 90 }, (_, index) => ({
      u: ((index * 47) % 97) / 97,
      v: ((index * 71 + 13) % 101) / 101,
      radius: .45 + (index % 4) * .2
    }));
    const captureStarts = [0, .31, .62];
    const captureWidth = .38;
    let width = 1;
    let height = 1;
    let activeRobot = -1;
    let cycleStart = performance.now();
    let wasVisible = false;
    let assetsReady = false;
    let drawQueued = false;
    let sequenceReady = false;
    let sequenceStartTimer = 0;

    const updateTheme = () => {
      const styles = getComputedStyle(document.body);
      palette.accent = styles.getPropertyValue("--accent").trim();
      palette.muted = styles.getPropertyValue("--muted").trim();
      palette.line = styles.getPropertyValue("--line").trim();
      palette.crack = "#000000";
      if (crackMask.complete && crackMask.naturalWidth) {
        crackTintContext.globalCompositeOperation = "source-over";
        crackTintContext.clearRect(0, 0, crackTint.width, crackTint.height);
        crackTintContext.fillStyle = palette.crack;
        crackTintContext.fillRect(0, 0, crackTint.width, crackTint.height);
        crackTintContext.globalCompositeOperation = "destination-in";
        crackTintContext.drawImage(crackMask, 0, 0);
        crackTintContext.globalCompositeOperation = "source-over";
      }
    };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const targetWidth = Math.round(width * pixelRatio);
      const targetHeight = Math.round(height * pixelRatio);
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };
    const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));
    const smooth = (value) => {
      const t = clamp(value);
      return t * t * (3 - 2 * t);
    };
    const mix = (from, to, amount) => from + (to - from) * amount;
    const mixRect = (from, to, amount) => ({
      x: mix(from.x, to.x, amount), y: mix(from.y, to.y, amount),
      width: mix(from.width, to.width, amount), height: mix(from.height, to.height, amount)
    });
    const strokeRect = (rect, alpha = 1, lineWidth = 1) => {
      context.save();
      context.strokeStyle = palette.accent;
      context.globalAlpha = alpha;
      context.lineWidth = lineWidth;
      context.strokeRect(rect.x, rect.y, rect.width, rect.height);
      context.restore();
    };
    const drawCrack = (rect, rangeStart, rangeWidth, sobelAmount, alpha) => {
      if (!crackTint.width || !crackTint.height) return;
      context.save();
      context.beginPath();
      context.rect(rect.x, rect.y, rect.width, rect.height);
      context.clip();
      const sourceX = clamp(rangeStart) * crackTint.width;
      const sourceWidth = clamp(rangeWidth, .01, 1) * crackTint.width;
      const crackHeight = Math.min(
        rect.height * .92,
        rect.width * (crackTint.height / crackTint.width)
      );
      const crackY = rect.y + (rect.height - crackHeight) * .5;
      context.globalAlpha = alpha * (1 - sobelAmount * .3);
      context.drawImage(
        crackTint,
        sourceX, 0, sourceWidth, crackTint.height,
        rect.x, crackY, rect.width, crackHeight
      );
      context.restore();
    };
    const drawInspectionFrustum = (cameraX, cameraY, targetRect, alpha = 1) => {
      const nearHalfWidth = 7;
      const nearY = cameraY - 23;
      context.save();
      context.beginPath();
      context.moveTo(cameraX - nearHalfWidth, nearY);
      context.lineTo(targetRect.x, targetRect.y + targetRect.height);
      context.lineTo(targetRect.x, targetRect.y);
      context.lineTo(targetRect.x + targetRect.width, targetRect.y);
      context.lineTo(targetRect.x + targetRect.width, targetRect.y + targetRect.height);
      context.lineTo(cameraX + nearHalfWidth, nearY);
      context.closePath();
      context.fillStyle = palette.muted;
      context.globalAlpha = alpha * .09;
      context.fill();

      const nearCorners = [
        [cameraX - nearHalfWidth, nearY - 3],
        [cameraX + nearHalfWidth, nearY - 3],
        [cameraX + nearHalfWidth, nearY + 3],
        [cameraX - nearHalfWidth, nearY + 3]
      ];
      const farCorners = [
        [targetRect.x, targetRect.y],
        [targetRect.x + targetRect.width, targetRect.y],
        [targetRect.x + targetRect.width, targetRect.y + targetRect.height],
        [targetRect.x, targetRect.y + targetRect.height]
      ];
      nearCorners.forEach((corner, index) => {
        context.beginPath();
        context.moveTo(corner[0], corner[1]);
        context.lineTo(farCorners[index][0], farCorners[index][1]);
        context.strokeStyle = palette.crack;
        context.lineWidth = 2.4;
        context.globalAlpha = alpha * .38;
        context.stroke();
        context.strokeStyle = palette.accent;
        context.lineWidth = 1;
        context.globalAlpha = alpha * .9;
        context.stroke();
      });
      context.strokeStyle = palette.crack;
      context.lineWidth = 2.4;
      context.globalAlpha = alpha * .42;
      context.strokeRect(targetRect.x, targetRect.y, targetRect.width, targetRect.height);
      context.strokeRect(cameraX - nearHalfWidth, nearY - 3, nearHalfWidth * 2, 6);
      context.strokeStyle = palette.accent;
      context.lineWidth = 1;
      context.globalAlpha = alpha;
      context.strokeRect(targetRect.x, targetRect.y, targetRect.width, targetRect.height);
      context.strokeRect(cameraX - nearHalfWidth, nearY - 3, nearHalfWidth * 2, 6);
      context.restore();
    };
    const drawInspectionRobot = (x, y, index, rotation = 0, alpha = 1) => {
      context.save();
      context.translate(x, y);
      context.rotate(rotation);
      x = 0;
      y = 0;
      context.strokeStyle = palette.accent;
      context.fillStyle = palette.accent;
      context.lineWidth = 1.2;
      context.lineCap = "round";
      [-7, 0, 7].forEach((legY) => {
        [[-24, -32], [24, 32]].forEach(([startX, endX]) => {
          context.beginPath();
          context.moveTo(startX, legY);
          context.lineTo(endX, legY + 3);
          context.globalAlpha = alpha * .9;
          context.lineWidth = 2.1;
          context.stroke();
        });
      });
      context.beginPath();
      context.roundRect(-25, -12, 50, 25, 3.5);
      context.globalAlpha = alpha * .18;
      context.fill();
      context.globalAlpha = alpha * .86;
      context.lineWidth = 1.5;
      context.stroke();

      context.beginPath();
      context.moveTo(0, -12);
      context.lineTo(0, -18);
      context.globalAlpha = alpha * .75;
      context.stroke();
      context.beginPath();
      context.roundRect(-12, -27, 24, 10, 2.5);
      context.globalAlpha = alpha * .42;
      context.fill();
      context.globalAlpha = alpha;
      context.lineWidth = 1.5;
      context.stroke();
      context.beginPath();
      context.arc(0, -28, 4.8, 0, Math.PI * 2);
      context.fillStyle = palette.crack;
      context.globalAlpha = alpha;
      context.fill();
      context.strokeStyle = palette.accent;
      context.lineWidth = 1.5;
      context.stroke();
      context.font = '500 8px "IBM Plex Mono", monospace';
      context.textAlign = "center";
      context.fillStyle = palette.muted;
      context.globalAlpha = alpha * .7;
      context.fillText(`MARSBOT 0${index + 1}`, 0, 30);
      context.restore();
    };
    const drawRobot = (x, y, index, alpha, targetRect) => {
      const selected = activeRobot === index;
      const emphasis = selected ? 1 : .64;
      context.save();
      context.globalAlpha = alpha * emphasis;
      context.fillStyle = palette.accent;
      context.strokeStyle = palette.accent;
      context.lineWidth = selected ? 1.8 : 1.15;
      const cameraY = y - 34;
      context.beginPath();
      context.moveTo(x - 8, cameraY - 2);
      context.lineTo(targetRect.x, targetRect.y + targetRect.height);
      context.lineTo(targetRect.x + targetRect.width, targetRect.y + targetRect.height);
      context.lineTo(x + 8, cameraY - 2);
      context.closePath();
      context.globalAlpha = alpha * (selected ? .19 : .1);
      context.fill();
      context.globalAlpha = alpha * emphasis;
      context.stroke();
      context.beginPath();
      context.moveTo(x, y - 7);
      context.lineTo(x, cameraY + 5);
      context.stroke();
      context.beginPath();
      context.roundRect(x - 15, cameraY - 7, 30, 14, 3);
      context.globalAlpha = alpha * (selected ? .3 : .17);
      context.fill();
      context.globalAlpha = alpha * emphasis;
      context.stroke();
      context.beginPath();
      context.arc(x, cameraY, 5.2, 0, Math.PI * 2);
      context.fillStyle = palette.muted;
      context.globalAlpha = alpha * .88;
      context.fill();
      context.strokeStyle = palette.accent;
      context.globalAlpha = alpha * emphasis;
      context.stroke();
      context.beginPath();
      context.roundRect(x - 29, y - 8, 58, 22, 5);
      context.fillStyle = palette.accent;
      context.globalAlpha = alpha * (selected ? .28 : .15);
      context.fill();
      context.globalAlpha = alpha * emphasis;
      context.stroke();
      [-20, 20].forEach((wheelX) => {
        context.beginPath();
        context.arc(x + wheelX, y + 15, 8, 0, Math.PI * 2);
        context.fillStyle = palette.muted;
        context.globalAlpha = alpha * .78;
        context.fill();
        context.strokeStyle = palette.accent;
        context.globalAlpha = alpha * emphasis;
        context.stroke();
        context.beginPath();
        context.arc(x + wheelX, y + 15, 2.2, 0, Math.PI * 2);
        context.fillStyle = palette.accent;
        context.fill();
      });
      context.font = '500 9px "IBM Plex Mono", monospace';
      context.textAlign = "center";
      context.fillStyle = palette.muted;
      context.globalAlpha = alpha;
      context.fillText(`CAMERA ROBOT 0${index + 1}`, x, y + 36);
      context.restore();
    };

    const drawConcreteWall = (rect) => {
      context.save();
      context.fillStyle = palette.muted;
      context.globalAlpha = .035;
      concreteSpeckles.filter((_, index) => index % 9 === 0).forEach(({ u, v }, index) => {
        context.beginPath();
        context.ellipse(
          rect.x + u * rect.width,
          rect.y + v * rect.height,
          rect.width * (.035 + index % 3 * .012),
          rect.height * (.055 + index % 2 * .018),
          index * .47,
          0,
          Math.PI * 2
        );
        context.fill();
      });
      context.globalAlpha = .22;
      concreteSpeckles.forEach(({ u, v, radius }) => {
        context.beginPath();
        context.arc(rect.x + u * rect.width, rect.y + v * rect.height, radius, 0, Math.PI * 2);
        context.fill();
      });
      context.restore();
    };

    const buildSobelImage = () => {
      const sobelWidth = 480;
      const sobelHeight = 300;
      sobelCanvas.width = sobelWidth;
      sobelCanvas.height = sobelHeight;
      const sobelContext = sobelCanvas.getContext("2d");
      sobelContext.fillStyle = "#000";
      sobelContext.fillRect(0, 0, sobelWidth, sobelHeight);
      const crackHeight = sobelWidth * (crackMask.naturalHeight / crackMask.naturalWidth);
      sobelContext.save();
      sobelContext.filter = "brightness(0) invert(1)";
      sobelContext.drawImage(crackMask, 0, (sobelHeight - crackHeight) / 2, sobelWidth, crackHeight);
      sobelContext.restore();
    };
    const draw = (time) => {
      if (!assetsReady) return;
      if (!isVisible()) {
        window.clearTimeout(sequenceStartTimer);
        sequenceStartTimer = 0;
        if (wasVisible) {
          resize();
          context.clearRect(0, 0, width, height);
        }
        wasVisible = false;
        sequenceReady = false;
        return;
      }
      if (!sequenceReady) {
        context.clearRect(0, 0, width, height);
        return;
      }
      if (!wasVisible) {
        wasVisible = true;
        cycleStart = time;
      }
      resize();
      context.clearRect(0, 0, width, height);
      {
      const wideStage = width >= 700;
      const pageElement = canvas.closest(".research-subpage");
      const copyElement = pageElement?.querySelector(".research-subpage-copy");
      const pageRect = pageElement?.getBoundingClientRect();
      const copyRect = copyElement?.getBoundingClientRect();
      const columnGap = pageElement ? parseFloat(getComputedStyle(pageElement).columnGap) || 0 : 0;
      const visualStart = wideStage && pageRect && copyRect
        ? copyRect.right - pageRect.left + columnGap
        : 0;
      // The canvas covers the complete subpage so robots can enter from the
      // main-stage edge. Derive the visual column from the live grid instead
      // of approximating its position with a percentage.
      const visualArea = wideStage
        ? { x: visualStart, y: 0, width: Math.max(0, width - visualStart), height }
        : { x: 0, y: 0, width, height };
      const wall = {
        x: visualArea.x + visualArea.width * .06,
        y: height * .035,
        width: visualArea.width * .88,
        height: height * .68
      };
      const animationDuration = 9000;
      const loopDuration = 10500;
      const loopElapsed = Math.max(0, time - cycleStart) % loopDuration;
      const cycle = Math.min(.94, loopElapsed / animationDuration);
      const wallIn = smooth((cycle - .02) / .075);
      const robotIn = smooth((cycle - .13) / .11);
      const frustumIn = smooth((cycle - .25) / .055);
      const sceneOut = smooth((cycle - .5) / .055);
      const sceneAlpha = wallIn * (1 - sceneOut);
      const tileProgress = smooth((cycle - .60) / .09);
      const sobelProgress = smooth((cycle - .69) / .085);
      const stitchProgress = smooth((cycle - .79) / .09);
      const trimProgress = smooth((cycle - .89) / .05);
      const finalFade = smooth((loopElapsed - 9700) / 500);

      const drawWall = (rect, alpha) => {
        context.save();
        context.fillStyle = palette.accent;
        context.globalAlpha = alpha * .5;
        context.fillRect(rect.x, rect.y, rect.width, rect.height);
        if (wallTexture.complete && wallTexture.naturalWidth) {
          context.globalAlpha = alpha * .9;
          context.imageSmoothingEnabled = true;
          context.drawImage(wallTexture, rect.x, rect.y, rect.width, rect.height);
        }
        context.restore();
        drawCrack(rect, 0, 1, 0, alpha);
      };
      const captureLayouts = [
        { start: 0, top: .17, width: .36, height: .66 },
        { start: .32, top: .08, width: .36, height: .74 },
        { start: .64, top: .19, width: .36, height: .68 }
      ];
      const targetRects = captureLayouts.map((capture) => ({
        x: wall.x + capture.start * wall.width,
        y: wall.y + capture.top * wall.height,
        width: capture.width * wall.width,
        height: capture.height * wall.height
      }));
      const robotY = wall.y + wall.height + height * .16;
      const robotOffsets = [
        { x: -wall.width * .035, y: 12, rotation: -.022 },
        { x: wall.width * .018, y: -9, rotation: .014 },
        { x: wall.width * .04, y: 8, rotation: -.018 }
      ];
      const robotPositions = targetRects.map((targetRect, index) => ({
        x: targetRect.x + targetRect.width * .5 + robotOffsets[index].x,
        y: robotY + robotOffsets[index].y,
        rotation: robotOffsets[index].rotation
      }));
      if (sceneAlpha > 0) drawWall(wall, sceneAlpha);
      if (frustumIn > 0 && sceneAlpha > 0) {
        targetRects.forEach((targetRect, index) => {
          drawInspectionFrustum(
            robotPositions[index].x,
            robotPositions[index].y - 2,
            targetRect,
            frustumIn * sceneAlpha * (1 - index * .06)
          );
        });
        drawCrack(wall, 0, 1, 0, sceneAlpha);
      }
      if (robotIn > 0 && sceneAlpha > 0) {
        robotPositions.forEach((position, index) => {
          // Start with the whole robot below the main stage, level with the
          // bottom edge used by the profile portrait, then drive upward.
          const currentY = mix(height + 46 + index * 4, position.y, robotIn);
          drawInspectionRobot(position.x, currentY, index, position.rotation, robotIn * sceneAlpha);
        });
      }
      const scanStarts = [.32, .335, .35];
      const captureReveal = scanStarts.map((scanStart) => smooth((cycle - scanStart) / .11));
      targetRects.forEach((targetRect, index) => {
        const scanStart = scanStarts[index];
        const scanProgress = captureReveal[index];
        const scanAlpha = Math.min(
          smooth((cycle - (scanStart - .012)) / .022),
          smooth(((scanStart + .135) - cycle) / .025)
        );
        if (scanAlpha <= 0) return;
        const scanY = targetRect.y + targetRect.height * scanProgress;
        context.save();
        context.beginPath();
        context.rect(targetRect.x, targetRect.y, targetRect.width, targetRect.height);
        context.clip();
        context.fillStyle = "#ffffff";
        context.globalAlpha = scanAlpha * .055;
        context.fillRect(targetRect.x, targetRect.y, targetRect.width, scanY - targetRect.y);
        context.beginPath();
        context.moveTo(targetRect.x, scanY);
        context.lineTo(targetRect.x + targetRect.width, scanY);
        context.strokeStyle = "#ffffff";
        context.lineWidth = 1.7;
        context.globalAlpha = scanAlpha;
        context.shadowColor = palette.accent;
        context.shadowBlur = 10;
        context.stroke();
        context.restore();
      });

      const drawColorCrop = (destination, capture, alpha) => {
        if (alpha <= 0) return;
        const sourceRect = {
          x: wall.x + capture.start * wall.width,
          y: wall.y + capture.top * wall.height,
          width: capture.width * wall.width,
          height: capture.height * wall.height
        };
        context.save();
        context.translate(destination.x - sourceRect.x, destination.y - sourceRect.y);
        context.beginPath();
        context.rect(sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height);
        context.clip();
        drawWall(wall, alpha);
        context.restore();
      };
      const drawSobelCrop = (destination, capture, alpha) => {
        if (!sobelCanvas.width || alpha <= 0) return;
        const sourceRect = {
          x: wall.x + capture.start * wall.width,
          y: wall.y + capture.top * wall.height,
          width: capture.width * wall.width,
          height: capture.height * wall.height
        };
        context.save();
        context.translate(destination.x - sourceRect.x, destination.y - sourceRect.y);
        context.beginPath();
        context.rect(sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height);
        context.clip();
        context.globalAlpha = alpha;
        context.fillStyle = "#000000";
        context.fillRect(wall.x, wall.y, wall.width, wall.height);
        context.imageSmoothingEnabled = true;
        context.drawImage(sobelCanvas, wall.x, wall.y, wall.width, wall.height);
        context.restore();
      };
      const tileGap = visualArea.width * .014;
      const seamBounds = [[0, .34], [.34, .66], [.66, 1]];
      const stitchedTop = wall.y + wall.height * .19;
      const stitchedBottom = wall.y + wall.height * .82;
      const separationHandoff = smooth(tileProgress / .18);
      if (sceneOut > 0 && separationHandoff < 1) {
        context.save();
        context.beginPath();
        targetRects.forEach((targetRect) => {
          context.rect(targetRect.x, targetRect.y, targetRect.width, targetRect.height);
        });
        context.clip();
        drawWall(wall, sceneOut * (1 - separationHandoff));
        context.restore();
      }
      captureLayouts.forEach((capture, index) => {
        if (captureReveal[index] <= 0) return;
        const targetRect = targetRects[index];
        const tiledX = visualArea.x + index * (targetRect.width + tileGap);
        const separatedX = mix(targetRect.x, tiledX, tileProgress);
        const currentX = mix(separatedX, targetRect.x, stitchProgress);
        const cardRect = {
          x: currentX,
          y: targetRect.y,
          width: targetRect.width,
          height: targetRect.height
        };
        // The retained image is the scanned portion of the original wall.
        // It replaces that exact region only as the unscanned wall fades out.
        const cardAlpha = sceneOut * separationHandoff * (1 - finalFade);
        const drawCard = (alpha) => {
          drawColorCrop(cardRect, capture, alpha * (1 - sobelProgress));
          drawSobelCrop(cardRect, capture, alpha * sobelProgress);
        };
        context.save();
        context.beginPath();
        context.rect(cardRect.x, cardRect.y, cardRect.width, cardRect.height * captureReveal[index]);
        context.clip();
        if (stitchProgress > .72) {
          context.beginPath();
          context.rect(wall.x, wall.y, wall.width, wall.height);
          context.clip();
        }
        drawCard(cardAlpha * (1 - trimProgress));
        context.restore();
        if (trimProgress > 0) {
          const [seamStart, seamEnd] = seamBounds[index];
          context.save();
          context.beginPath();
          context.rect(
            wall.x + seamStart * wall.width,
            stitchedTop,
            (seamEnd - seamStart) * wall.width,
            stitchedBottom - stitchedTop
          );
          context.clip();
          drawCard(cardAlpha * trimProgress);
          context.restore();
        }
      });
      }
      return;
      if (!isVisible()) {
        wasVisible = false;
        return;
      }
      if (!wasVisible) {
        wasVisible = true;
        cycleStart = time;
      }
      resize();
      context.clearRect(0, 0, width, height);
      const cycle = reduceMotionQuery.matches ? .82 : ((time - cycleStart) % 9600) / 9600;
      const phaseAlpha = (start, end) => Math.min(smooth((cycle - start) / .035), smooth((end - cycle) / .035));
      const captureAlpha = reduceMotionQuery.matches ? 0 : phaseAlpha(0, .35);
      const sobelAlpha = reduceMotionQuery.matches ? 0 : phaseAlpha(.32, .69);
      const stitchAlpha = reduceMotionQuery.matches ? 1 : phaseAlpha(.66, 1);
      const activeStage = cycle < .34 ? 0 : cycle < .68 ? 1 : 2;
      const labels = ["CAPTURE", "SOBEL", "STITCH"];
      context.font = '500 11px "IBM Plex Mono", monospace';
      context.textAlign = "center";
      labels.forEach((label, index) => {
        const x = width * (.28 + index * .22);
        context.fillStyle = index === activeStage ? palette.accent : palette.muted;
        context.globalAlpha = index === activeStage ? 1 : .42;
        context.fillText(label, x, 20);
        context.beginPath();
        context.moveTo(x - 24, 28);
        context.lineTo(x + 24, 28);
        context.strokeStyle = index === activeStage ? palette.accent : palette.line;
        context.lineWidth = index === activeStage ? 2 : 1;
        context.stroke();
      });

      const drawWallGrid = (rect, alpha) => {
        context.save();
        context.fillStyle = palette.muted;
        context.globalAlpha = alpha * .035;
        concreteSpeckles.filter((_, index) => index % 9 === 0).forEach(({ u, v }, index) => {
          context.beginPath();
          context.ellipse(
            rect.x + u * rect.width,
            rect.y + v * rect.height,
            rect.width * (.035 + index % 3 * .012),
            rect.height * (.055 + index % 2 * .018),
            index * .47,
            0,
            Math.PI * 2
          );
          context.fill();
        });
        context.fillStyle = palette.muted;
        context.globalAlpha = alpha * .22;
        concreteSpeckles.forEach(({ u, v, radius }) => {
          context.beginPath();
          context.arc(rect.x + u * rect.width, rect.y + v * rect.height, radius, 0, Math.PI * 2);
          context.fill();
        });
        context.restore();
      };

      if (captureAlpha > 0) {
        const wall = { x: width * .07, y: height * .12, width: width * .86, height: height * .45 };
        context.fillStyle = palette.accent;
        context.globalAlpha = captureAlpha * .045;
        context.fillRect(wall.x, wall.y, wall.width, wall.height);
        strokeRect(wall, captureAlpha * .85, 1.3);
        drawWallGrid(wall, captureAlpha);
        drawCrack(wall, 0, 1, 0, captureAlpha);
        const robotY = height * .79;
        captureStarts.forEach((start, index) => {
          const view = { x: wall.x + start * wall.width, y: wall.y, width: captureWidth * wall.width, height: wall.height };
          context.fillStyle = palette.accent;
          context.globalAlpha = captureAlpha * (activeRobot === index ? .2 : .095);
          context.fillRect(view.x, view.y, view.width, view.height);
          strokeRect(view, captureAlpha * (activeRobot === index ? 1 : .72), activeRobot === index ? 2 : 1.2);
          context.font = '500 9px "IBM Plex Mono", monospace';
          context.textAlign = "left";
          context.fillStyle = palette.accent;
          context.globalAlpha = captureAlpha;
          context.fillText(`VIEW ${index + 1}`, view.x + 7, view.y + 15);
          const scanY = view.y + view.height * ((cycle / .34 + index * .2) % 1);
          context.beginPath();
          context.moveTo(view.x, scanY);
          context.lineTo(view.x + view.width, scanY);
          context.strokeStyle = palette.accent;
          context.globalAlpha = captureAlpha * .75;
          context.lineWidth = 1.4;
          context.stroke();
          drawRobot(view.x + view.width / 2, robotY, index, captureAlpha, view);
        });
      }

      if (sobelAlpha > 0) {
        captureStarts.forEach((start, index) => {
          const card = { x: width * (.035 + index * .325), y: height * .17, width: width * .285, height: height * .53 };
          context.fillStyle = palette.accent;
          context.globalAlpha = sobelAlpha * .065;
          context.fillRect(card.x, card.y, card.width, card.height);
          strokeRect(card, sobelAlpha * .9, 1.4);
          drawCrack(card, start, captureWidth, 1, sobelAlpha);
          context.font = '500 9px "IBM Plex Mono", monospace';
          context.textAlign = "center";
          context.fillStyle = palette.accent;
          context.globalAlpha = sobelAlpha;
          context.fillText(`EDGE MAP 0${index + 1}`, card.x + card.width / 2, card.y + card.height + 20);
          context.fillStyle = palette.muted;
          context.globalAlpha = sobelAlpha * .75;
          context.fillText("SOBEL 3×3", card.x + card.width / 2, card.y + 17);
        });
      }

      if (stitchAlpha > 0) {
        const result = { x: width * .07, y: height * .14, width: width * .86, height: height * .58 };
        context.fillStyle = palette.accent;
        context.globalAlpha = stitchAlpha * .055;
        context.fillRect(result.x, result.y, result.width, result.height);
        drawWallGrid(result, stitchAlpha);
        [captureStarts[1], captureStarts[2]].forEach((seam) => {
          const seamX = result.x + seam * result.width;
          context.fillStyle = palette.accent;
          context.globalAlpha = stitchAlpha * .11;
          context.fillRect(seamX - result.width * .035, result.y, result.width * .07, result.height);
          context.beginPath();
          context.setLineDash([5, 5]);
          context.moveTo(seamX, result.y);
          context.lineTo(seamX, result.y + result.height);
          context.strokeStyle = palette.accent;
          context.globalAlpha = stitchAlpha * .85;
          context.lineWidth = 1.3;
          context.stroke();
          context.setLineDash([]);
        });
        drawCrack(result, 0, 1, 1, stitchAlpha);
        strokeRect(result, stitchAlpha, 2);
        context.font = '500 10px "IBM Plex Mono", monospace';
        context.textAlign = "right";
        context.fillStyle = palette.accent;
        context.globalAlpha = stitchAlpha;
        context.fillText("STITCHED WALL MAP", result.x + result.width, result.y - 10);
        context.textAlign = "center";
        context.fillStyle = palette.muted;
        context.globalAlpha = stitchAlpha;
        context.fillText("3 OVERLAPPING VIEWS  →  1 WALL-SCALE MAP", width / 2, result.y + result.height + 25);
      }
    };

    const redraw = () => {
      updateTheme();
      scheduleDraw();
    };
    const scheduleDraw = () => {
      if (drawQueued) return;
      drawQueued = true;
      window.requestAnimationFrame((time) => {
        drawQueued = false;
        draw(time);
      });
    };
    document.addEventListener("sectionthemechange", redraw);
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", redraw);
    new ResizeObserver(scheduleDraw).observe(canvas);
    const armSequence = (delay = 650) => {
      if (!isVisible() || sequenceReady || sequenceStartTimer) return;
      sequenceStartTimer = window.setTimeout(() => {
        sequenceStartTimer = 0;
        if (!isVisible()) return;
        sequenceReady = true;
        wasVisible = false;
        cycleStart = performance.now();
      }, delay);
    };
    const visibilityObserver = new MutationObserver(() => {
      if (isVisible()) armSequence();
      else {
        window.clearTimeout(sequenceStartTimer);
        sequenceStartTimer = 0;
        sequenceReady = false;
      }
      scheduleDraw();
    });
    [researchView, roboticsSection, roboticsPage].filter(Boolean).forEach((element) => {
      visibilityObserver.observe(element, { attributes: true, attributeFilter: ["class"] });
    });
    document.addEventListener("researchpageentered", (event) => {
      if (event.detail?.incoming !== roboticsPage) return;
      window.clearTimeout(sequenceStartTimer);
      sequenceStartTimer = 0;
      armSequence(0);
    });
    const loadImage = (image, source) => new Promise((resolve, reject) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", reject, { once: true });
      image.src = source;
    });
    const baseAssets = Promise.all([
      loadImage(wallTexture, "assets/Crack/concrete-plaster-mask.png"),
      loadImage(crackMask, "assets/Crack/crack-reference-mask.png")
    ]);
    baseAssets.then(() => {
      crackTint.width = crackMask.naturalWidth;
      crackTint.height = crackMask.naturalHeight;
      updateTheme();
      buildSobelImage();
      assetsReady = true;
      canvas.dataset.renderReady = "true";
      if (sequenceReady) {
        wasVisible = false;
        cycleStart = performance.now();
      }
      scheduleDraw();
    }).catch(() => {});
    updateTheme();
    const animate = (time) => {
      if (isVisible() && !sequenceReady) armSequence();
      draw(time);
      window.requestAnimationFrame(animate);
    };
    window.requestAnimationFrame(animate);
  };

  const initArControlInterface = () => {
    const stage = document.querySelector("[data-ar-control]");
    if (!stage) return;
    const robot = stage.querySelector("[data-ar-selected-bot]");
    const robotLabel = stage.querySelector("[data-ar-map-bot-label]");
    const direction = stage.querySelector("[data-ar-direction]");
    const cameraScene = stage.querySelector("[data-ar-camera-scene]");
    const status = stage.querySelector("[data-ar-command-status]");
    const readout = stage.querySelector("[data-ar-control-readout]");
    const controls = [...stage.querySelectorAll("[data-ar-command]")];
    const fingerShapes = [...stage.querySelectorAll("[data-ar-finger-shape]")];
    const controlMap = stage.querySelector(".ar-control-map");
    const visorForeignObject = stage.querySelector(".ar-visor-3d-shell");
    const visorHost = stage.querySelector(".ar-visor-3d-host");
    const threeCanvas = stage.querySelector("[data-ar-3d-canvas]");
    const camCanvas = stage.querySelector("[data-ar-cam-canvas]");
    const mapCenterX = 168;
    const mapCenterY = 109;
    const mapToWorldX = 12 / 160;
    const mapToWorldZ = 12 / 102;
    let robotX = mapCenterX;
    let robotY = mapCenterY;
    let heading = 0;
    let cameraHeading = 0;
    let cameraWorldX = 0;
    let cameraWorldZ = 0;
    let cameraPoseFrame = null;
    let botIsMoving = false;
    let renderThreeView = null;
    let arWarmupFrame = 0;
    let arWarmupUntil = 0;
    const safariAr = /Apple/i.test(navigator.vendor || "")
      && /Safari/i.test(navigator.userAgent)
      && !/(Chrome|Chromium|CriOS|Edg|EdgiOS|OPR|FxiOS)/i.test(navigator.userAgent);
    stage.classList.toggle("is-safari-ar", safariAr);
    if (safariAr && controlMap && visorForeignObject && visorHost) {
      const safariShell = document.createElement("div");
      safariShell.className = "ar-visor-safari-shell";
      stage.insertBefore(safariShell, controlMap);
      safariShell.append(visorHost);
      visorForeignObject.style.display = "none";
      const visorBounds = { x: 89.2, y: 3.68, width: 644, height: 263.12 };
      const syncSafariVisor = () => {
        const stageRect = stage.getBoundingClientRect();
        const mapRect = controlMap.getBoundingClientRect();
        const viewBox = controlMap.viewBox?.baseVal;
        if (!stageRect.width || !stageRect.height || !mapRect.width || !mapRect.height || !viewBox?.width || !viewBox?.height) return;
        const scale = Math.min(mapRect.width / viewBox.width, mapRect.height / viewBox.height);
        const viewportLeft = mapRect.left - stageRect.left + (mapRect.width - viewBox.width * scale) / 2;
        const viewportTop = mapRect.top - stageRect.top + (mapRect.height - viewBox.height * scale) / 2;
        safariShell.style.left = `${viewportLeft + (visorBounds.x - viewBox.x) * scale}px`;
        safariShell.style.top = `${viewportTop + (visorBounds.y - viewBox.y) * scale}px`;
        safariShell.style.width = `${visorBounds.width * scale}px`;
        safariShell.style.height = `${visorBounds.height * scale}px`;
        renderThreeView?.();
      };
      new ResizeObserver(syncSafariVisor).observe(controlMap);
      window.requestAnimationFrame(syncSafariVisor);
    }
    const warmArCanvas = (duration = 650) => {
      arWarmupUntil = Math.max(arWarmupUntil, performance.now() + duration);
      if (arWarmupFrame) return;
      const drawWarmupFrame = () => {
        renderThreeView?.();
        if (performance.now() < arWarmupUntil) arWarmupFrame = window.requestAnimationFrame(drawWarmupFrame);
        else arWarmupFrame = 0;
      };
      arWarmupFrame = window.requestAnimationFrame(drawWarmupFrame);
    };
    const animateCameraPose = () => {
      if (!renderThreeView) return;
      if (cameraPoseFrame) window.cancelAnimationFrame(cameraPoseFrame);
      const startHeading = cameraHeading;
      const startWorldX = cameraWorldX;
      const startWorldZ = cameraWorldZ;
      const targetHeading = heading;
      const targetWorldX = (robotX - mapCenterX) * mapToWorldX;
      const targetWorldZ = (robotY - mapCenterY) * mapToWorldZ;
      const startTime = performance.now();
      const duration = 340;
      botIsMoving = true;
      const tick = (now) => {
        const progress = Math.min(1, (now - startTime) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        cameraHeading = startHeading + (targetHeading - startHeading) * eased;
        cameraWorldX = startWorldX + (targetWorldX - startWorldX) * eased;
        cameraWorldZ = startWorldZ + (targetWorldZ - startWorldZ) * eased;
        botIsMoving = progress < 1;
        renderThreeView();
        if (progress < 1) cameraPoseFrame = window.requestAnimationFrame(tick);
        else cameraPoseFrame = null;
      };
      cameraPoseFrame = window.requestAnimationFrame(tick);
    };

    if (threeCanvas && window.THREE) {
      const styles = getComputedStyle(document.body);
      const accent = styles.getPropertyValue("--accent").trim();
      const muted = styles.getPropertyValue("--muted").trim();
      const canvasColor = styles.getPropertyValue("--canvas").trim();
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(canvasColor);
      scene.fog = new THREE.Fog(new THREE.Color(canvasColor), 7, 18);
      const robotCamera = new THREE.PerspectiveCamera(58, 1, .1, 40);
      const overviewCamera = new THREE.PerspectiveCamera(46, 1, .1, 50);
      overviewCamera.position.set(4.4, 10.7, 9.4);
      overviewCamera.up.set(0, 1, 0);
      overviewCamera.lookAt(-1.35, 1.25, -3.75);
      const renderer = new THREE.WebGLRenderer({ canvas: threeCanvas, antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const camRenderer = camCanvas ? new THREE.WebGLRenderer({ canvas: camCanvas, antialias: true, preserveDrawingBuffer: true }) : null;
      if (camRenderer) {
        camRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        camRenderer.outputColorSpace = THREE.SRGBColorSpace;
      }

      const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x182019, 1.55);
      scene.add(hemisphereLight);
      const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
      keyLight.position.set(-3, 7, 5);
      scene.add(keyLight);

      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(12, 12),
        new THREE.MeshStandardMaterial({ color: muted, roughness: .92, metalness: 0 })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(0, 0, 0);
      scene.add(floor);
      const exteriorGrid = new THREE.GridHelper(60, 60, accent, muted);
      exteriorGrid.position.y = -.025;
      const exteriorGridMaterials = Array.isArray(exteriorGrid.material) ? exteriorGrid.material : [exteriorGrid.material];
      exteriorGridMaterials.forEach((material) => {
        material.transparent = true;
        material.opacity = .28;
        material.depthWrite = false;
      });
      scene.add(exteriorGrid);

      const crackTextureCanvas = document.createElement("canvas");
      crackTextureCanvas.width = 1024;
      crackTextureCanvas.height = 512;
      const crackContext = crackTextureCanvas.getContext("2d");
      crackContext.fillStyle = muted;
      crackContext.fillRect(0, 0, 1024, 512);
      crackContext.globalAlpha = .38;
      crackContext.fillStyle = accent;
      crackContext.fillRect(0, 0, 1024, 512);
      crackContext.globalAlpha = .16;
      for (let index = 0; index < 170; index += 1) {
        const x = (index * 83) % 1024;
        const y = (index * 137) % 512;
        crackContext.fillStyle = index % 3 ? "#101512" : "#ffffff";
        crackContext.fillRect(x, y, 1 + index % 3, 1 + index % 2);
      }
      crackContext.globalAlpha = 1;
      crackContext.strokeStyle = "#090b0a";
      crackContext.lineCap = "round";
      crackContext.lineJoin = "round";
      crackContext.lineWidth = 18;
      crackContext.beginPath();
      crackContext.moveTo(-20, 260);
      crackContext.lineTo(120, 244);
      crackContext.lineTo(226, 174);
      crackContext.lineTo(348, 194);
      crackContext.lineTo(420, 292);
      crackContext.lineTo(566, 324);
      crackContext.lineTo(680, 284);
      crackContext.lineTo(800, 330);
      crackContext.lineTo(1044, 250);
      crackContext.stroke();
      crackContext.lineWidth = 5;
      crackContext.beginPath();
      crackContext.moveTo(418, 292);
      crackContext.lineTo(390, 216);
      crackContext.lineTo(402, 146);
      crackContext.moveTo(680, 284);
      crackContext.lineTo(720, 230);
      crackContext.lineTo(738, 174);
      crackContext.stroke();
      const crackTexture = new THREE.CanvasTexture(crackTextureCanvas);
      crackTexture.colorSpace = THREE.SRGBColorSpace;
      const wall = new THREE.Mesh(
        new THREE.PlaneGeometry(12, 5.2),
        new THREE.MeshStandardMaterial({ map: crackTexture, roughness: .88, metalness: 0 })
      );
      wall.position.set(0, 2.6, -6);
      scene.add(wall);

      const roomWallMaterial = new THREE.MeshStandardMaterial({
        color: muted,
        roughness: .92,
        metalness: 0,
        transparent: false,
        opacity: 1,
        depthWrite: true,
        side: THREE.DoubleSide
      });
      const roomWalls = [
        { position: [-6, 2.6, 0], rotation: [0, Math.PI / 2, 0] },
        { position: [6, 2.6, 0], rotation: [0, -Math.PI / 2, 0] },
        { position: [0, 2.6, 6], rotation: [0, Math.PI, 0] }
      ];
      roomWalls.forEach(({ position, rotation }) => {
        const roomWall = new THREE.Mesh(new THREE.PlaneGeometry(12, 5.2), roomWallMaterial);
        roomWall.position.set(...position);
        roomWall.rotation.set(...rotation);
        scene.add(roomWall);
      });

      const botModel = new THREE.Group();
      const botSource = new THREE.Group();
      const botScale = .019;
      botSource.matrixAutoUpdate = false;
      botSource.matrix.set(
        0, botScale, 0, 0,
        0, 0, botScale, .54,
        botScale, 0, 0, 0,
        0, 0, 0, 1
      );
      botModel.add(botSource);
      botModel.scale.setScalar(1.85);
      const botStructureMaterial = new THREE.MeshStandardMaterial({ color: accent, transparent: true, opacity: .3, roughness: .72, metalness: .05, side: THREE.DoubleSide });
      const botBoardMaterial = new THREE.MeshStandardMaterial({ color: accent, transparent: true, opacity: .24, roughness: .62, metalness: .12, side: THREE.DoubleSide });
      const botComponentMaterial = new THREE.MeshStandardMaterial({ color: accent, transparent: true, opacity: .58, roughness: .5, metalness: .16, side: THREE.DoubleSide });
      const botMotorMaterial = new THREE.MeshStandardMaterial({ color: accent, transparent: true, opacity: .7, roughness: .3, metalness: .62, side: THREE.DoubleSide });
      const botLensMaterial = new THREE.MeshStandardMaterial({ color: canvasColor, roughness: .12, metalness: .34 });
      const botLegMaterial = new THREE.MeshStandardMaterial({ color: accent, transparent: true, opacity: .72, roughness: .78, metalness: .04 });
      const botEdgeMaterial = new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: .82 });
      const addBotEdges = (mesh, threshold = 20) => {
        mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, threshold), botEdgeMaterial));
        return mesh;
      };
      const addBotBox = (size, position, material) => {
        const mesh = addBotEdges(new THREE.Mesh(new THREE.BoxGeometry(...size), material));
        mesh.position.set(...position);
        botSource.add(mesh);
        return mesh;
      };
      const addBotCylinder = (radius, depth, position, rotation, material, segments = 28) => {
        const mesh = addBotEdges(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, segments), material));
        mesh.position.set(...position);
        mesh.rotation.set(...rotation);
        botSource.add(mesh);
        return mesh;
      };
      addBotBox([74, 42, 4], [0, 0, 0], botStructureMaterial);
      addBotBox([7, 18, 21.5], [-22, 0, 12.75], botBoardMaterial);
      addBotCylinder(4.8, 3, [-17, 0, 18], [0, 0, -Math.PI / 2], botComponentMaterial, 32);
      addBotCylinder(3.6, 1.8, [-14.6, 0, 18], [0, 0, -Math.PI / 2], botComponentMaterial, 32);
      addBotCylinder(2.35, 1, [-13.2, 0, 18], [0, 0, -Math.PI / 2], botLensMaterial, 28);
      addBotCylinder(5.4, 22, [20, 0, 7.4], [0, 0, Math.PI / 2], botMotorMaterial, 32);
      addBotCylinder(1.7, 7, [34.5, 0, 7.4], [0, 0, Math.PI / 2], botMotorMaterial, 20);
      const botRotorGroup = new THREE.Group();
      botRotorGroup.position.set(38, 0, 7.4);
      const botRotor = addBotEdges(new THREE.Mesh(new THREE.CylinderGeometry(4.35, 4.35, 2.8, 32, 1, false, 0, Math.PI), botComponentMaterial));
      botRotor.rotation.z = Math.PI / 2;
      botRotorGroup.add(botRotor);
      botSource.add(botRotorGroup);
      const botLegGeometry = new THREE.CylinderGeometry(1.5, 1.9, 23, 12);
      const botLegAxis = new THREE.Vector3(0, 1, 0);
      const addBotLeg = (x, y, direction) => {
        const start = new THREE.Vector3(x, y, -2);
        const end = new THREE.Vector3(x - 6, y + direction * 1.5, -25);
        const vector = end.clone().sub(start);
        const leg = new THREE.Mesh(botLegGeometry, botLegMaterial);
        leg.position.copy(start).add(end).multiplyScalar(.5);
        leg.quaternion.setFromUnitVectors(botLegAxis, vector.clone().normalize());
        leg.scale.y = vector.length() / 23;
        botSource.add(leg);
      };
      [-23, 0, 23].forEach((x) => {
        addBotLeg(x, -16, -1);
        addBotLeg(x, 16, 1);
      });
      scene.add(botModel);
      let botRotorAngle = 0;
      let botLastRenderTime = performance.now();

      renderThreeView = () => {
        const rect = threeCanvas.getBoundingClientRect();
        const viewWidth = Math.max(1, rect.width);
        const viewHeight = Math.max(1, rect.height);
        renderer.setSize(viewWidth, viewHeight, false);
        overviewCamera.aspect = viewWidth / viewHeight;
        overviewCamera.updateProjectionMatrix();
        robotCamera.position.set(cameraWorldX, 2.6, cameraWorldZ);
        robotCamera.rotation.set(-.035, -cameraHeading * Math.PI / 180, 0);
        botModel.position.set(cameraWorldX, 0, cameraWorldZ);
        botModel.rotation.y = Math.PI - cameraHeading * Math.PI / 180;
        const botNow = performance.now();
        const botDelta = Math.min(40, Math.max(0, botNow - botLastRenderTime));
        botLastRenderTime = botNow;
        if (botIsMoving) botRotorAngle += botDelta * .12;
        botRotorGroup.rotation.x = botRotorAngle;
        const vibration = botIsMoving ? Math.sin(botNow * .075) : 0;
        botModel.position.y = botIsMoving ? Math.max(0, vibration) * .024 : 0;
        botModel.rotation.x = vibration * .012;
        botModel.rotation.z = vibration * .0025;
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, viewWidth, viewHeight);
        const sceneFog = scene.fog;
        scene.fog = null;
        renderer.render(scene, overviewCamera);
        scene.fog = sceneFog;
        const insetWidth = Math.max(1, Math.round(viewWidth * .3));
        const insetHeight = Math.max(1, Math.round(viewHeight * .3497));
        robotCamera.aspect = insetWidth / insetHeight;
        robotCamera.updateProjectionMatrix();
        if (camRenderer) {
          camRenderer.setSize(insetWidth, insetHeight, false);
          camRenderer.render(scene, robotCamera);
        }
        threeCanvas.dataset.cameraHeading = cameraHeading.toFixed(2);
        threeCanvas.dataset.cameraWorldX = cameraWorldX.toFixed(3);
        threeCanvas.dataset.cameraWorldZ = cameraWorldZ.toFixed(3);
      };
      const updateArTheme = () => {
        const themeStyles = getComputedStyle(document.body);
        const themeAccent = themeStyles.getPropertyValue("--accent").trim();
        const themeMuted = themeStyles.getPropertyValue("--muted").trim();
        const themeCanvas = themeStyles.getPropertyValue("--canvas").trim();
        scene.background.setStyle(themeCanvas);
        scene.fog.color.setStyle(themeCanvas);
        floor.material.color.setStyle(themeMuted);
        roomWallMaterial.color.setStyle(themeMuted);
        [botStructureMaterial, botBoardMaterial, botComponentMaterial, botMotorMaterial, botLegMaterial].forEach((material) => {
          material.color.setStyle(themeAccent);
        });
        botEdgeMaterial.color.setStyle(themeAccent);
        botLensMaterial.color.setStyle(themeCanvas);
        renderThreeView?.();
      };
      document.addEventListener("sectionthemechange", updateArTheme);
      updateArTheme();
      new ResizeObserver(() => renderThreeView?.()).observe(threeCanvas);
    }

    document.addEventListener("researchpagewillenter", (event) => {
      if (event.detail?.incoming !== stage.closest("[data-research-subpage]")) return;
      warmArCanvas(720);
    });
    document.addEventListener("researchpageentered", (event) => {
      if (event.detail?.incoming !== stage.closest("[data-research-subpage]")) return;
      warmArCanvas(320);
    });

    const renderState = (command = "ready") => {
      if (robot) robot.style.transform = `translate(${robotX}px, ${robotY}px) rotate(${heading}deg) scale(.55)`;
      if (robotLabel) robotLabel.style.transform = `translate(${robotX}px, ${robotY}px)`;
      if (direction) direction.style.transform = `translate(${robotX}px, ${robotY}px) rotate(${heading}deg)`;
      cameraScene.style.transform = `translate(${(mapCenterX - robotX) * .55 - heading * .72}px, ${(mapCenterY - robotY) * .42}px) scale(1.03)`;
      const commandText = {
        ready: "READY / MARSBOT",
        forward: "FORWARD / 0.25 M",
        left: "TURN LEFT / 15 DEG",
        right: "TURN RIGHT / 15 DEG"
      }[command];
      const readoutText = {
        ready: "Select a fingertip command.",
        forward: "Index finger · moving forward",
        left: "Thumb · turning left",
        right: "Middle finger · turning right"
      }[command];
      if (status) status.textContent = commandText;
      if (readout) readout.textContent = readoutText;
      if (command === "ready") {
        cameraHeading = heading;
        cameraWorldX = (robotX - mapCenterX) * mapToWorldX;
        cameraWorldZ = (robotY - mapCenterY) * mapToWorldZ;
        renderThreeView?.();
      } else animateCameraPose();
    };

    controls.forEach((control) => {
      control.addEventListener("keydown", (event) => {
        if (!["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        control.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      control.addEventListener("click", () => {
        const command = control.dataset.arCommand;
        if (command === "left") heading -= 15;
        if (command === "right") heading += 15;
        if (command === "forward") {
          const radians = heading * Math.PI / 180;
          robotX = Math.max(110, Math.min(226, robotX + Math.sin(radians) * 12));
          robotY = Math.max(80, Math.min(138, robotY - Math.cos(radians) * 7.65));
        }
        controls.forEach((button) => button.classList.toggle("is-commanded", button === control));
        const finger = fingerShapes.find((shape) => shape.dataset.arFingerShape === command);
        fingerShapes.forEach((shape) => shape.classList.toggle("is-bent", shape === finger));
        renderState(command);
        window.setTimeout(() => {
          control.classList.remove("is-commanded");
          finger?.classList.remove("is-bent");
        }, 320);
      });
    });
    renderState();
  };

  const initSkillsNetwork = () => {
    const network = document.querySelector("[data-skills-network]");
    if (!network) return;

    const nodes = [...network.querySelectorAll(".skill-node")];
    const tree = network.querySelector(".skill-tree");
    const toolsBranch = network.querySelector("[data-skill-tools-branch]");
    const toolsList = toolsBranch?.querySelector(".skill-tool-list");
    const leafRoutes = tree?.querySelector("[data-skill-leaf-routes]");
    if (!nodes.length || !tree || !toolsBranch || !toolsList || !leafRoutes) return;

    let activeNode = nodes.find((node) => node.classList.contains("active")) || nodes[0];
    let branchSwitching = false;
    let queuedNode = null;
    const branchFadeDuration = 200;
    const routeRevealDuration = 280;
    const tagRevealDelay = 90;
    const delay = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));

    const drawToolsRoute = () => {
      if (!activeNode) return;
      const treeBox = tree.getBoundingClientRect();
      const nodeBox = activeNode.getBoundingClientRect();
      if (!treeBox.width || !treeBox.height) return;
      const routeGap = 8;
      const x1 = (nodeBox.right - treeBox.left + routeGap) / treeBox.width * 1000;
      const y1 = (nodeBox.top + nodeBox.height / 2 - treeBox.top) / treeBox.height * 420;
      const curvePath = (endX, endY) => {
        const distanceX = endX - x1;
        const controlX1 = x1 + distanceX * .42;
        const controlX2 = x1 + distanceX * .58;
        return `M${x1} ${y1}C${controlX1} ${y1} ${controlX2} ${endY} ${endX} ${endY}`;
      };
      leafRoutes.replaceChildren(...[...toolsList.children].map((leaf) => {
        const leafBox = leaf.getBoundingClientRect();
        const endX = (leafBox.left - treeBox.left - routeGap) / treeBox.width * 1000;
        const endY = (leafBox.top + leafBox.height / 2 - treeBox.top) / treeBox.height * 420;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", curvePath(endX, endY));
        path.style.opacity = leaf.style.opacity || "1";
        return path;
      }));
    };

    const setActiveNode = (node) => {
      nodes.forEach((item) => {
        const selected = item === node;
        item.classList.toggle("active", selected);
        item.setAttribute("aria-pressed", String(selected));
      });
    };

    const buildTools = (node, opacity = "1") => {
      const levels = (node.dataset.skillLevels || "")
        .split(" · ")
        .map((level) => Math.max(0, Math.min(4, Number.parseInt(level, 10) || 0)));
      const leaves = (node.dataset.skillTools || "")
        .split(" · ")
        .filter(Boolean)
        .map((tool, toolIndex) => {
          const level = levels[toolIndex] || 0;
          const leaf = document.createElement("span");
          const name = document.createElement("span");
          name.className = "skill-tool-name";
          name.textContent = tool;
          const meter = document.createElement("span");
          meter.className = "skill-level";
          meter.setAttribute("role", "img");
          meter.setAttribute("aria-label", `${level} out of 4 proficiency`);
          for (let index = 1; index <= 4; index += 1) {
            const cell = document.createElement("i");
            cell.className = index <= level ? "filled" : "";
            cell.setAttribute("aria-hidden", "true");
            meter.append(cell);
          }
          leaf.append(name, meter);
          leaf.style.opacity = opacity;
          return leaf;
        });
      toolsList.replaceChildren(...leaves);
      return leaves;
    };

    const fadeToolGroup = async (leaves, routes, opacity) => {
      [...leaves, ...routes].forEach((element) => { element.style.opacity = String(opacity); });
      if (!reduceMotion) await delay(branchFadeDuration);
    };

    const revealToolGroup = async (leaves, routes) => {
      if (reduceMotion) {
        [...leaves, ...routes].forEach((element) => { element.style.opacity = "1"; });
        return;
      }

      const routeTasks = routes.map(async (route) => {
        const routeLength = Math.max(1, route.getTotalLength());
        route.style.opacity = "1";
        const animation = route.animate([
          { opacity: 0, strokeDasharray: `${routeLength} ${routeLength}`, strokeDashoffset: routeLength },
          { opacity: 1, strokeDasharray: `${routeLength} ${routeLength}`, strokeDashoffset: 0 }
        ], {
          duration: routeRevealDuration,
          easing: "cubic-bezier(.22, .8, .3, 1)",
          fill: "forwards"
        });
        await animation.finished.catch(() => {});
        route.style.opacity = "1";
        animation.cancel();
      });

      await delay(tagRevealDelay);
      leaves.forEach((leaf) => { leaf.style.opacity = "1"; });
      await Promise.all([...routeTasks, delay(branchFadeDuration)]);
    };

    const selectNode = async (node) => {
      if (node === activeNode && !branchSwitching) return;
      if (branchSwitching) {
        queuedNode = node;
        return;
      }

      branchSwitching = true;
      const oldLeaves = [...toolsList.children];
      const oldRoutes = [...leafRoutes.children];
      await fadeToolGroup(oldLeaves, oldRoutes, 0);

      activeNode = node;
      setActiveNode(node);
      const newLeaves = buildTools(node, "0");
      drawToolsRoute();
      const newRoutes = [...leafRoutes.children];
      await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
      await revealToolGroup(newLeaves, newRoutes);

      branchSwitching = false;
      const nextNode = queuedNode;
      queuedNode = null;
      if (nextNode && nextNode !== activeNode) selectNode(nextNode);
    };

    nodes.forEach((node) => {
      node.addEventListener("click", () => selectNode(node));
    });
    window.addEventListener("resize", drawToolsRoute);
    document.addEventListener("sectionentered", (event) => {
      if (event.detail?.incoming?.id === "profile-skills") drawToolsRoute();
    });
    document.addEventListener("skillstreeready", drawToolsRoute);
    setActiveNode(activeNode);
    buildTools(activeNode);
    window.requestAnimationFrame(drawToolsRoute);
  };

  const viewFromHash = () => {
    const hash = window.location.hash.slice(1);
    return viewNames.find((name) => hash === name || hash.startsWith(`${name}-`)) || "profile";
  };

  const currentSection = (view) => view.querySelector(".page-section.active");
  const stagePortrait = document.querySelector(".overview-portrait-stage");
  const desktopPortrait = window.matchMedia("(min-width: 851px)");

  const animationList = (container) => {
    const root = container.classList.contains("content-view") ? currentSection(container) : container;
    if (!root) return [];
    const elements = [...root.querySelectorAll(
      ":scope > .small-label, :scope > h2, :scope > .intro-copy > *, :scope > .work-heading, :scope > .work-row, :scope > .thermal-layout > .thermal-heading > *, :scope > .thermal-layout > .thermal-pager > .thermal-page.is-active > .thermal-page-copy > .page-kicker, :scope > .thermal-layout > .thermal-pager > .thermal-page.is-active > .thermal-page-copy > .thermal-points > li, :scope > .thermal-layout > .thermal-pager > .thermal-page.is-active > .stack-scene, :scope > .thermal-layout > .thermal-pager > .thermal-page.is-active > .thermal-stage, :scope > .thermal-layout > .thermal-pager > .thermal-page.is-active > .moe-stage, :scope > .research-showcase-layout > .research-showcase-heading > *, :scope > .research-showcase-layout > .research-subpager > .research-subpage.is-active > .research-subpage-copy > .page-kicker, :scope > .research-showcase-layout > .research-subpager > .research-subpage.is-active > .research-subpage-copy > .thermal-points > li, :scope > .research-showcase-layout > .research-subpager > .research-subpage.is-active > .research-visual, :scope > .research-showcase-layout > .research-showcase-content > .research-showcase-copy > .page-kicker, :scope > .research-showcase-layout > .research-showcase-content > .research-showcase-copy > .thermal-points > li, :scope > .research-showcase-layout > .research-overview-content > .research-project-intro > *, :scope > .research-showcase-layout > .research-overview-content > .research-mindmap, :scope > .research-showcase-layout > .research-showcase-content > .showcase-list > .work-row, :scope > .research-showcase-layout > .research-showcase-content > .experience-signal > .profile-timeline-line, :scope > .research-showcase-layout > .research-showcase-content > .experience-signal > .experience-stop, :scope > .research-showcase-layout > .research-showcase-content > .education-timeline > .profile-timeline-line, :scope > .research-showcase-layout > .research-showcase-content > .education-timeline > .education-stop, :scope > .research-showcase-layout > .research-showcase-content > .skills-network > *, :scope > .research-showcase-layout > .publications-pager > .publications-page.is-active > .publication-card, :scope > .research-showcase-layout > .research-showcase-content > .research-visual, :scope > .research-showcase-layout > .photography-gallery > *, :scope > .music-mixer-heading > *, :scope > .music-intro-list > li, :scope > .music-mixer-copy > .music-track-list > li, :scope.content-footer > *"
    )];

    if (root.id === "profile-overview") {
      const portrait = desktopPortrait.matches
        ? stagePortrait
        : root.querySelector(":scope > .overview-portrait-inline");
      if (portrait) elements.push(portrait);
    }

    if (container.classList.contains("content-view") && container.dataset.view === "music") {
      const orchestra = container.querySelector(".music-orchestra");
      if (orchestra && !elements.includes(orchestra)) elements.push(orchestra);
    }

    return elements;
  };

  const navList = (nav) => [...nav.querySelectorAll("a")];

  const setOpacity = (elements, opacity) => {
    elements.forEach((element) => { element.style.opacity = String(opacity); });
  };

  const revealSkillsTree = async (elements, tree) => {
    const headings = elements.filter((element) => element !== tree);
    const root = tree.querySelector(".skill-core");
    const branches = [...tree.querySelectorAll(".skill-branch")];
    const nodes = [...tree.querySelectorAll(".skill-node")];
    const tags = [...tree.querySelectorAll(".skill-tool-list > span")];
    const depthOnePaths = [...tree.querySelectorAll('[data-skill-depth-routes="1"] path')];
    const depthTwoPaths = [...tree.querySelectorAll('[data-skill-depth-routes="2"] path')];
    const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));
    const nextFrame = () => new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));

    const revealCards = (cards, stagger = 0, pulse = true) => {
      cards.forEach((card, index) => {
        window.setTimeout(() => {
          card.style.opacity = "1";
          if (!pulse) return;
          card.classList.remove("skill-card-arriving");
          void card.offsetWidth;
          card.classList.add("skill-card-arriving");
          window.setTimeout(() => card.classList.remove("skill-card-arriving"), treePulseDuration);
        }, index * stagger);
      });
      return wait(Math.max(0, cards.length - 1) * stagger + treeFadeDuration);
    };

    const drawPaths = (paths, duration) => Promise.all(paths.map(async (path) => {
      const length = Math.max(1, path.getTotalLength());
      path.style.opacity = "1";
      const animation = path.animate([
        { opacity: 0, strokeDasharray: `${length} ${length}`, strokeDashoffset: length },
        { opacity: 1, strokeDasharray: `${length} ${length}`, strokeDashoffset: 0 }
      ], {
        duration,
        easing: "cubic-bezier(.22, .8, .3, 1)",
        fill: "forwards"
      });
      await animation.finished.catch(() => {});
      path.style.opacity = "1";
      animation.cancel();
    }));

    const initialCards = [root, ...branches, ...nodes, ...tags].filter(Boolean);
    const staticPaths = [...depthOnePaths, ...depthTwoPaths];
    initialCards.forEach((card) => card.classList.remove("skill-card-arriving"));
    setOpacity(initialCards, 0);
    setOpacity(staticPaths, 0);
    setOpacity(headings, 1);
    await wait(treeFadeDuration);

    tree.style.opacity = "1";
    await nextFrame();
    document.dispatchEvent(new CustomEvent("skillstreeready"));
    const leafPaths = [...tree.querySelectorAll(".skill-leaf-routes path")];
    setOpacity(leafPaths, 0);

    revealCards([root].filter(Boolean), 0, false);
    await wait(70);

    const firstRoutes = drawPaths(depthOnePaths, 180);
    await wait(90);
    const firstCards = revealCards(branches);
    await Promise.all([firstRoutes, firstCards]);

    const secondRoutes = drawPaths(depthTwoPaths, 220);
    await wait(70);
    const secondCards = revealCards(nodes, 15);
    await Promise.all([secondRoutes, secondCards]);

    const toolRoutes = drawPaths(leafPaths, 170);
    await wait(45);
    const toolCards = revealCards(tags, 12);
    await Promise.all([toolRoutes, toolCards]);
  };

  const drawResearchMindmapRoutes = (map) => {
    const projectRoutes = map?.querySelector('[data-research-map-routes="projects"]');
    const skillRoutes = map?.querySelector('[data-research-map-routes="skills"]');
    const core = map?.querySelector(".research-map-core");
    const projects = [...(map?.querySelectorAll(".research-map-project") || [])];
    const skillGroups = [...(map?.querySelectorAll(".research-map-skills") || [])];
    if (!map || !projectRoutes || !skillRoutes || !core || !projects.length) return;

    const mapBox = map.getBoundingClientRect();
    if (!mapBox.width || !mapBox.height) return;
    const mobile = window.matchMedia("(max-width: 520px)").matches;
    const point = (box, xRatio, yRatio) => ({
      x: (box.left + box.width * xRatio - mapBox.left) / mapBox.width * 1000,
      y: (box.top + box.height * yRatio - mapBox.top) / mapBox.height * 420
    });
    const curve = (start, end, vertical = false) => {
      if (vertical) {
        const distanceY = end.y - start.y;
        return `M${start.x} ${start.y}C${start.x} ${start.y + distanceY * .42} ${end.x} ${start.y + distanceY * .58} ${end.x} ${end.y}`;
      }
      const distanceX = end.x - start.x;
      return `M${start.x} ${start.y}C${start.x + distanceX * .42} ${start.y} ${start.x + distanceX * .58} ${end.y} ${end.x} ${end.y}`;
    };
    const makePath = (d) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      return path;
    };

    const coreBox = core.getBoundingClientRect();
    projectRoutes.replaceChildren(...projects.map((project) => {
      const projectBox = project.getBoundingClientRect();
      const start = mobile ? point(coreBox, .5, 1) : point(coreBox, 1, .5);
      const end = point(projectBox, 0, .5);
      return makePath(curve(start, end, mobile));
    }));
    skillRoutes.replaceChildren(...projects.flatMap((project, index) => {
      const skillGroup = skillGroups[index];
      if (!skillGroup) return [];
      const projectBox = project.getBoundingClientRect();
      const skillBox = skillGroup.getBoundingClientRect();
      const start = mobile ? point(projectBox, .5, 1) : point(projectBox, 1, .5);
      const end = mobile ? point(skillBox, .5, 0) : point(skillBox, 0, .5);
      return [makePath(curve(start, end, mobile))];
    }));
  };

  const initResearchMindmap = () => {
    const maps = [...document.querySelectorAll("[data-research-mindmap]")];
    if (!maps.length) return;
    const redraw = (map) => window.requestAnimationFrame(() => drawResearchMindmapRoutes(map));
    window.addEventListener("resize", () => maps.forEach(redraw));
    document.addEventListener("sectionentered", (event) => {
      maps
        .filter((map) => map.closest(".page-section") === event.detail?.incoming)
        .forEach(redraw);
    });
    document.addEventListener("viewentered", (event) => {
      maps
        .filter((map) => map.closest(".content-view") === event.detail?.incoming)
        .forEach(redraw);
    });
    maps.forEach(redraw);
  };

  const revealResearchMindmap = async (elements, map) => {
    const headings = elements.filter((element) => element.matches(".small-label, h2"));
    const introductions = elements.filter((element) => element.matches(".research-project-intro > li"));
    const core = map.querySelector(".research-map-core");
    const projects = [...map.querySelectorAll(".research-map-project")];
    const skills = [...map.querySelectorAll(".research-map-skills span")];
    const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));
    const nextFrame = () => new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    const revealCards = (cards, stagger = 0, pulse = false) => {
      cards.forEach((card, index) => {
        window.setTimeout(() => {
          card.style.opacity = "1";
          if (!pulse) return;
          card.classList.remove("map-card-arriving");
          void card.offsetWidth;
          card.classList.add("map-card-arriving");
          window.setTimeout(() => card.classList.remove("map-card-arriving"), treePulseDuration);
        }, index * stagger);
      });
      return wait(Math.max(0, cards.length - 1) * stagger + treeFadeDuration);
    };

    map.classList.add("is-preparing");
    [core, ...projects, ...skills].filter(Boolean).forEach((card) => {
      card.classList.remove("map-card-arriving");
      card.style.opacity = "0";
    });
    setOpacity([...map.querySelectorAll(".research-map-routes path")], 0);
    map.style.opacity = "1";
    void map.offsetWidth;
    await nextFrame();
    drawResearchMindmapRoutes(map);
    const projectRoutes = [...map.querySelectorAll('[data-research-map-routes="projects"] path')];
    const skillRoutes = [...map.querySelectorAll('[data-research-map-routes="skills"] path')];
    setOpacity([...projectRoutes, ...skillRoutes], 0);
    void map.offsetWidth;
    map.classList.remove("is-preparing");
    const drawPaths = (paths, duration) => Promise.all(paths.map(async (path) => {
      const length = Math.max(1, path.getTotalLength());
      const animation = path.animate([
        { opacity: 0, strokeDasharray: `${length} ${length}`, strokeDashoffset: length },
        { opacity: 1, strokeDasharray: `${length} ${length}`, strokeDashoffset: 0 }
      ], {
        duration,
        easing: "cubic-bezier(.22, .8, .3, 1)",
        fill: "both"
      });
      await animation.finished.catch(() => {});
      path.style.opacity = "1";
      animation.cancel();
    }));

    await revealCards(headings, treeStepDelay);
    await revealCards(introductions, treeStepDelay);
    await revealCards([core].filter(Boolean), 0, true);
    await wait(70);
    const projectLines = drawPaths(projectRoutes, 220);
    await wait(90);
    const projectCards = revealCards(projects, 22, true);
    await Promise.all([projectLines, projectCards]);
    const skillLines = drawPaths(skillRoutes, 180);
    await wait(60);
    const skillCards = revealCards(skills, 11, true);
    await Promise.all([skillLines, skillCards]);
  };

  const drawLocalLinkSystemRoutes = (map) => {
    const routes = map?.querySelector("[data-locallink-system-routes]");
    const controller = map?.querySelector('[data-locallink-system-node="controller"]');
    const app = map?.querySelector('[data-locallink-system-node="app"]');
    const display = map?.querySelector('[data-locallink-system-node="display"]');
    const sensor = map?.querySelector('[data-locallink-system-node="sensor"]');
    const time = map?.querySelector('[data-locallink-system-node="time"]');
    if (!map || !routes || !controller || !app || !display || !sensor || !time) return;

    if (window.matchMedia("(max-width: 850px)").matches) {
      routes.replaceChildren();
      return;
    }

    const mapBox = map.getBoundingClientRect();
    if (!mapBox.width || !mapBox.height) return;
    const mapPoint = (x, y) => ({
      x: (x - mapBox.left) / mapBox.width * 1000,
      y: (y - mapBox.top) / mapBox.height * 600
    });
    const straight = (start, end) => `M${start.x} ${start.y}L${end.x} ${end.y}`;
    const verticalCurve = (start, end) => {
      const distanceY = end.y - start.y;
      return `M${start.x} ${start.y}C${start.x} ${start.y + distanceY * .4} ${end.x} ${end.y - distanceY * .4} ${end.x} ${end.y}`;
    };
    const wirelessWave = (source, radiusX, radiusY, direction = -1) => {
      const controlX = source.x + direction * radiusX * 4 / 3;
      return `M${source.x} ${source.y - radiusY}C${controlX} ${source.y - radiusY} ${controlX} ${source.y + radiusY} ${source.x} ${source.y + radiusY}`;
    };
    const makePath = (target, d, kind = "route") => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.dataset.locallinkSystemRoute = target;
      path.dataset.locallinkSystemKind = kind;
      path.setAttribute("d", d);
      return path;
    };
    const makeEmitter = (source, name) => {
      const emitter = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
      emitter.dataset.locallinkWirelessEmitter = name;
      emitter.setAttribute("cx", `${source.x}`);
      emitter.setAttribute("cy", `${source.y}`);
      emitter.setAttribute("rx", `${2.2 / mapBox.width * 1000}`);
      emitter.setAttribute("ry", `${2.2 / mapBox.height * 600}`);
      return emitter;
    };

    const controllerBox = controller.getBoundingClientRect();
    const appBox = app.getBoundingClientRect();
    const displayBox = display.getBoundingClientRect();
    const sensorBox = sensor.getBoundingClientRect();
    const timeBox = time.getBoundingClientRect();
    const routeClearance = 0;
    const wirelessClearance = 5;
    const wirelessSource = mapPoint(
      controllerBox.left - wirelessClearance,
      controllerBox.top + controllerBox.height * .5
    );
    const appWirelessSource = mapPoint(
      appBox.right + wirelessClearance,
      appBox.top + appBox.height * .5
    );
    const wirelessGap = Math.max(18, controllerBox.left - appBox.right);
    const maximumWaveRadius = Math.min(controllerBox.height * .54, appBox.height * .54, wirelessGap * .68);
    const waveRadius = {
      x: maximumWaveRadius / mapBox.width * 1000,
      y: maximumWaveRadius / mapBox.height * 600
    };
    const makeWirelessWaves = (source, direction, name, phaseOffset = 0) => Array.from({ length: 3 }, (_, index) => {
      const wave = makePath("app", wirelessWave(source, waveRadius.x, waveRadius.y, direction), "wireless");
      wave.dataset.locallinkWirelessDirection = name;
      wave.style.setProperty("--locallink-wireless-delay", `${index * .6 + phaseOffset}s`);
      return wave;
    });
    const controllerWaves = makeWirelessWaves(wirelessSource, -1, "from-controller");
    const appWaves = makeWirelessWaves(appWirelessSource, 1, "from-app", .3);
    routes.replaceChildren(
      ...controllerWaves,
      ...appWaves,
      makePath("display", straight(
        mapPoint(controllerBox.right + routeClearance, controllerBox.top + controllerBox.height * .5),
        mapPoint(displayBox.left - routeClearance, displayBox.top + displayBox.height * .5)
      ), "direct"),
      makePath("sensor", verticalCurve(
        mapPoint(controllerBox.left + controllerBox.width * .42, controllerBox.bottom + routeClearance),
        mapPoint(sensorBox.left + sensorBox.width * .5, sensorBox.top - routeClearance)
      )),
      makePath("time", verticalCurve(
        mapPoint(controllerBox.left + controllerBox.width * .58, controllerBox.bottom + routeClearance),
        mapPoint(timeBox.left + timeBox.width * .5, timeBox.top - routeClearance)
      )),
      makeEmitter(wirelessSource, "controller"),
      makeEmitter(appWirelessSource, "app")
    );
  };

  const revealLocalLinkSystem = async (elements, map) => {
    const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));
    if (window.matchMedia("(max-width: 850px)").matches) {
      elements.forEach((element, index) => {
        window.setTimeout(() => { element.style.opacity = "1"; }, treeStepDelay * index);
      });
      return wait(Math.max(0, elements.length - 1) * treeStepDelay + treeFadeDuration);
    }

    const nextFrame = () => new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    const visual = elements.find((element) => element.matches(".locallink-system-visual")) || map.closest(".locallink-system-visual");
    const headings = elements.filter((element) => element.matches(".small-label, h2, .page-kicker"));
    const introductions = elements.filter((element) => element.matches(".thermal-points > li"));
    const otherElements = elements.filter((element) => element !== visual && !headings.includes(element) && !introductions.includes(element));
    const core = map.querySelector('[data-locallink-system-node="controller"]');
    const surroundingNodes = [...map.querySelectorAll("[data-locallink-system-node]")].filter((node) => node !== core);
    const labels = [...map.querySelectorAll(".locallink-system-link span")];
    const existingRoutes = [...map.querySelectorAll(".locallink-system-routes path, .locallink-system-routes ellipse")];
    const pulseCard = (card) => {
      const className = card === core ? "map-card-arriving" : "skill-card-arriving";
      card.classList.remove(className);
      void card.offsetWidth;
      card.classList.add(className);
      window.setTimeout(() => card.classList.remove(className), treePulseDuration);
    };
    const revealCards = (cards, stagger = 0, pulse = false) => {
      if (!cards.length) return Promise.resolve();
      cards.forEach((card, index) => {
        window.setTimeout(() => {
          card.style.opacity = "1";
          if (pulse) pulseCard(card);
        }, index * stagger);
      });
      return wait(Math.max(0, cards.length - 1) * stagger + treeFadeDuration);
    };
    const drawPaths = (paths, duration) => Promise.all(paths.filter((path) => path.dataset.locallinkSystemKind !== "wireless").map(async (path) => {
      const length = Math.max(1, path.getTotalLength());
      const animation = path.animate([
        { opacity: 0, strokeDasharray: `${length} ${length}`, strokeDashoffset: length },
        { opacity: 1, strokeDasharray: `${length} ${length}`, strokeDashoffset: 0 }
      ], {
        duration,
        easing: "cubic-bezier(.22, .8, .3, 1)",
        fill: "both"
      });
      await animation.finished.catch(() => {});
      path.style.opacity = "1";
      animation.cancel();
    }));

    map.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
    map.classList.remove("is-wifi-live");
    map.classList.add("is-preparing");
    [core, ...surroundingNodes, ...labels, ...existingRoutes].filter(Boolean).forEach((element) => {
      element.classList.remove("map-card-arriving", "skill-card-arriving");
      element.style.opacity = "0";
    });
    map.style.opacity = "1";
    if (visual) visual.style.opacity = "1";
    await nextFrame();
    drawLocalLinkSystemRoutes(map);
    const paths = [...map.querySelectorAll(".locallink-system-routes path")];
    setOpacity(paths, 0);
    void map.offsetWidth;
    map.classList.remove("is-preparing");
    map.classList.add("is-animating");

    await revealCards(headings, treeStepDelay);
    await revealCards(introductions, treeStepDelay);
    if (otherElements.length) await revealCards(otherElements, treeStepDelay);
    await revealCards([core].filter(Boolean), 0, true);
    await wait(70);

    const routeAnimation = drawPaths(paths, 270);
    await wait(90);
    const labelAnimation = revealCards(labels);
    await wait(45);
    const nodeAnimation = revealCards(surroundingNodes, 0, true);
    await Promise.all([routeAnimation, labelAnimation, nodeAnimation]);
    map.classList.remove("is-animating");
    await nextFrame();
    map.classList.add("is-wifi-live");
  };

  const animatePublicationCards = async (cards, fadeIn, initialDelay = 0) => {
    if (!cards.length) return;
    const targetOpacity = fadeIn ? "1" : "0";
    setOpacity(cards, fadeIn ? 0 : 1);
    if (reduceMotion) {
      setOpacity(cards, targetOpacity);
      return;
    }
    const animations = cards.map((card, index) => card.animate([
      { opacity: fadeIn ? 0 : 1 },
      { opacity: fadeIn ? 1 : 0 }
    ], {
      duration: fadeDuration,
      delay: initialDelay + index * stepDelay,
      easing: "ease",
      fill: "both"
    }));
    await Promise.all(animations.map((animation) => animation.finished.catch(() => {})));
    cards.forEach((card, index) => {
      card.style.opacity = targetOpacity;
      animations[index].cancel();
    });
  };

  const settlePhotographyImages = async (frames) => {
    if (!appleWebKitPhotography || !frames.length) return;
    const waits = frames.map((frame) => {
      const image = frame.querySelector("img");
      if (!image) return Promise.resolve();
      image.loading = "eager";
      if (image.complete && image.naturalWidth > 0) {
        return typeof image.decode === "function" ? image.decode().catch(() => {}) : Promise.resolve();
      }
      return new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      }).then(() => (typeof image.decode === "function" ? image.decode().catch(() => {}) : undefined));
    });
    await Promise.race([
      Promise.all(waits),
      new Promise((resolve) => window.setTimeout(resolve, 1600))
    ]);
    await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
  };

  const prepareSafariPhotographyFrames = (frames) => {
    if (!appleWebKitPhotography) return;
    frames.forEach((frame) => {
      frame.style.transition = "none";
      frame.style.opacity = "0";
    });
  };

  const animatePhotographyRows = async (section, fadeIn, imageReady = null) => {
    const sheet = section?.querySelector(".photography-contact-sheet");
    const frames = [...(sheet?.querySelectorAll(":scope > .photography-frame") || [])]
      .filter((frame) => !frame.hidden);
    if (!sheet || !frames.length) return;

    frames.sort((a, b) => a.offsetTop - b.offsetTop || a.offsetLeft - b.offsetLeft);

    const targetOpacity = fadeIn ? "1" : "0";
    setOpacity(frames, fadeIn ? 0 : 1);
    sheet.style.opacity = "1";
    if (fadeIn) await (imageReady || settlePhotographyImages(frames));
    if (reduceMotion) {
      setOpacity(frames, targetOpacity);
      frames.forEach((frame) => frame.style.removeProperty("transition"));
      return;
    }

    const frameDelay = 45;
    const frameDuration = 220;
    const totalTime = Math.max(0, frames.length - 1) * frameDelay + frameDuration;
    if (appleWebKitPhotography) {
      frames.forEach((frame, frameIndex) => {
        frame.style.transition = `opacity ${frameDuration}ms ease ${frameIndex * frameDelay}ms`;
      });
      await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
      setOpacity(frames, targetOpacity);
      await new Promise((resolve) => window.setTimeout(resolve, totalTime));
      await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
      frames.forEach((frame) => frame.style.removeProperty("transition"));
      return;
    }

    const animations = frames.map((frame, frameIndex) => frame.animate([
      { opacity: fadeIn ? 0 : 1 },
      { opacity: fadeIn ? 1 : 0 }
    ], {
      duration: frameDuration,
      delay: frameIndex * frameDelay,
      easing: "ease",
      fill: "both"
    }));

    await Promise.all(animations.map((animation) => animation.finished.catch(() => {})));
    setOpacity(frames, targetOpacity);
    animations.forEach((animation) => animation.cancel());
  };

  const resetPhotographyGallery = (gallery) => {
    if (!gallery) return;
    gallery.scrollLeft = 0;
    gallery.scrollTop = 0;
  };

  const readPhotographyMetadata = (frame) => {
    const sourcePath = frame?.getAttribute("href");
    if (!sourcePath) return;
    const encodedFilename = sourcePath.split("/").pop() || "";
    let filename = encodedFilename;
    try {
      filename = decodeURIComponent(encodedFilename);
    } catch {}
    const basename = filename.replace(/\.[^.]+$/, "");
    const match = basename.match(/^(\d{2})-(\d{2})-(\d{4}),\s*(.+)$/);
    if (!match) return;

    const [, month, day, year, rawName] = match;
    const displayName = rawName.replace(/\s+\d+(?=\s*,|$)/g, "").trim();
    const date = frame.querySelector(".photography-caption time");
    const name = frame.querySelector(".photography-caption strong");
    if (date) {
      date.dateTime = `${year}-${month}-${day}`;
      date.textContent = `${month}.${day}`;
    }
    if (name) name.textContent = displayName;
  };

  const fadeList = (elements, fadeIn) => {
    const targetOpacity = fadeIn ? 1 : 0;
    if (fadeIn) setOpacity(elements, 0);

    if (reduceMotion) {
      setOpacity(elements, targetOpacity);
      return Promise.resolve();
    }

    const skillTree = fadeIn ? elements.find((element) => element.classList.contains("skill-tree")) : null;
    if (skillTree) return revealSkillsTree(elements, skillTree);

    const researchMindmap = fadeIn ? elements.find((element) => element.classList.contains("research-mindmap")) : null;
    if (researchMindmap) return revealResearchMindmap(elements, researchMindmap);

    const localLinkSystemVisual = fadeIn ? elements.find((element) => element.matches(".locallink-system-visual")) : null;
    const localLinkSystemMap = localLinkSystemVisual?.querySelector("[data-locallink-system-map]");
    if (localLinkSystemMap) return revealLocalLinkSystem(elements, localLinkSystemMap);

    const publicationCards = elements.filter((element) => element.classList.contains("publication-card"));
    if (publicationCards.length) {
      const otherElements = elements.filter((element) => !publicationCards.includes(element));
      otherElements.forEach((element, index) => {
        window.setTimeout(() => { element.style.opacity = String(targetOpacity); }, stepDelay * index);
      });
      const cardDelay = otherElements.length * stepDelay;
      const cardAnimation = animatePublicationCards(publicationCards, fadeIn, cardDelay);
      const otherDuration = Math.max(0, otherElements.length - 1) * stepDelay + fadeDuration;
      return Promise.all([
        cardAnimation,
        new Promise((resolve) => window.setTimeout(resolve, otherDuration))
      ]);
    }

    const timelineLine = fadeIn
      ? elements.find((element) => element.classList.contains("profile-timeline-line") && getComputedStyle(element).display !== "none")
      : null;

    if (timelineLine) {
      const headings = elements.filter((element) => element.matches(".small-label, h2"));
      let cards = elements.filter((element) => (
        element.classList.contains("experience-stop") || element.classList.contains("education-stop")
      ));
      if (timelineLine.classList.contains("education-timeline-line")) {
        cards = cards.reverse();
      }
      const otherElements = elements.filter((element) => (
        element !== timelineLine && !headings.includes(element) && !cards.includes(element)
      ));
      const isEducationTimeline = timelineLine.classList.contains("education-timeline-line");
      timelineLine.style.transform = isEducationTimeline ? "scaleY(0)" : "scaleX(0)";
      setOpacity(headings, 1);
      window.setTimeout(() => {
        timelineLine.style.opacity = "1";
        timelineLine.style.transform = isEducationTimeline ? "scaleY(1)" : "scaleX(1)";
      }, fadeDuration);
      const cardStart = fadeDuration + timelineDrawDuration;
      [...otherElements, ...cards].forEach((element, index) => {
        window.setTimeout(() => {
          element.style.opacity = "1";
          if (element.classList.contains("experience-stop") || element.classList.contains("education-stop")) {
            element.classList.remove("timeline-card-arriving");
            void element.offsetWidth;
            element.classList.add("timeline-card-arriving");
            window.setTimeout(() => element.classList.remove("timeline-card-arriving"), timelineCardPulseDuration);
          }
        }, cardStart + stepDelay * index);
      });
      const remainingCount = otherElements.length + cards.length;
      const totalTime = cardStart + Math.max(0, remainingCount - 1) * stepDelay + timelineCardPulseDuration;
      return new Promise((resolve) => window.setTimeout(resolve, totalTime));
    }

    elements.forEach((element, index) => {
      window.setTimeout(() => { element.style.opacity = String(targetOpacity); }, stepDelay * index);
    });

    const totalTime = Math.max(0, elements.length - 1) * stepDelay + fadeDuration;
    return new Promise((resolve) => window.setTimeout(resolve, totalTime));
  };

  const setActivePageLink = (nav, activeLink) => {
    nav.querySelectorAll("a").forEach((link) => {
      const isActive = link === activeLink;
      link.classList.toggle("active", isActive);
      if (isActive) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  };

  const showPageSection = (view, section) => {
    view.querySelectorAll(".page-section").forEach((item) => {
      const isActive = item === section;
      item.classList.toggle("active", isActive);
      item.setAttribute("aria-hidden", String(!isActive));
      item.toggleAttribute("inert", !isActive);
    });
    view.scrollTop = 0;
  };

  const updatePrimaryNavigation = (name) => {
    tabs.forEach((tab) => {
      const isActive = tab.dataset.viewTarget === name;
      tab.classList.toggle("active", isActive);
      if (isActive) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    });
  };

  const initThermalPager = () => {
    const pager = document.querySelector("[data-thermal-pager]");
    if (!pager) return;

    const schedulerPage = pager.querySelector(".thermal-page-scheduler");
    const moePage = pager.querySelector(".thermal-page-moe");
    if (schedulerPage && moePage) pager.insertBefore(schedulerPage, moePage);

    const pages = [...pager.querySelectorAll("[data-thermal-page]")];
    const rulerButtons = [...document.querySelectorAll("[data-thermal-page-target]")];
    if (!pages.length || !rulerButtons.length) return;

    let activePage = 0;
    let pageSwitching = false;
    let wheelGestureLocked = false;
    let wheelGestureResetTimer = 0;
    let wheelDelta = 0;
    const setActiveThermalPage = (index) => {
      const next = Math.max(0, Math.min(index, pages.length - 1));
      if (next === activePage && pages[next].classList.contains("is-active")) return;
      activePage = next;
      pages.forEach((page, pageIndex) => page.classList.toggle("is-active", pageIndex === activePage));
      rulerButtons.forEach((button, buttonIndex) => {
        const isActive = buttonIndex === activePage;
        button.classList.toggle("active", isActive);
        if (isActive) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });
    };

    const pageItems = (page) => [...page.querySelectorAll(
      ":scope > .thermal-page-copy > .page-kicker, :scope > .thermal-page-copy > .thermal-points > li, :scope > .stack-scene, :scope > .thermal-stage, :scope > .moe-stage"
    )];

    const changeThermalPage = async (index) => {
      const target = Math.max(0, Math.min(index, pages.length - 1));
      if (target === activePage || pageSwitching) return;

      pageSwitching = true;
      const outgoing = pages[activePage];
      const incoming = pages[target];
      await fadeList(pageItems(outgoing), false);
      document.dispatchEvent(new CustomEvent("thermalpagechange", { detail: { outgoing, incoming } }));

      setOpacity(pageItems(incoming), 0);
      pager.scrollTo({ top: incoming.offsetTop, behavior: "auto" });
      setActiveThermalPage(target);
      void incoming.offsetWidth;
      await fadeList(pageItems(incoming), true);
      document.dispatchEvent(new CustomEvent("thermalpageentered", { detail: { outgoing, incoming } }));
      pageSwitching = false;
    };

    const blockMiddleAutoScroll = (event) => {
      if (event.button !== 1) return;
      event.preventDefault();
    };

    pager.addEventListener("mousedown", blockMiddleAutoScroll, { capture: true });
    pager.addEventListener("auxclick", blockMiddleAutoScroll, { capture: true });

    pager.addEventListener("wheel", (event) => {
      if (!event.deltaY) return;
      event.preventDefault();

      window.clearTimeout(wheelGestureResetTimer);
      wheelGestureResetTimer = window.setTimeout(() => {
        wheelGestureLocked = false;
        wheelDelta = 0;
      }, 220);

      if (wheelGestureLocked || pageSwitching) return;
      wheelDelta += event.deltaY;
      if (Math.abs(wheelDelta) < 18) return;

      wheelGestureLocked = true;
      changeThermalPage(activePage + (wheelDelta > 0 ? 1 : -1));
    }, { passive: false });
    rulerButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const target = Number(button.dataset.thermalPageTarget);
        changeThermalPage(target);
      });
    });
    document.addEventListener("thermalpagerreset", () => {
      window.clearTimeout(wheelGestureResetTimer);
      wheelGestureLocked = false;
      wheelDelta = 0;
      const outgoing = pages[activePage];
      const incoming = pages[0];
      if (outgoing !== incoming) {
        document.dispatchEvent(new CustomEvent("thermalpagechange", { detail: { outgoing, incoming } }));
      }
      pageSwitching = false;
      const items = pages.flatMap(pageItems);
      items.forEach((item) => {
        item.style.transition = "none";
        item.style.opacity = "0";
      });
      pager.scrollTo({ top: 0, behavior: "auto" });
      setActiveThermalPage(0);
      void pager.offsetWidth;
      items.forEach((item) => item.style.removeProperty("transition"));
    });
    setActiveThermalPage(0);
  };

  const initResearchPager = () => {
    const pager = document.querySelector("[data-research-subpager]");
    if (!pager) return;

    const pages = [...pager.querySelectorAll("[data-research-subpage]")];
    const rulerButtons = [...document.querySelectorAll("[data-research-page-target]")];
    if (!pages.length || !rulerButtons.length) return;

    let activePage = 0;
    let pageSwitching = false;
    let wheelGestureLocked = false;
    let wheelGestureResetTimer = 0;
    let wheelDelta = 0;

    const pageItems = (page) => {
      const items = [...page.querySelectorAll(
      ":scope > .research-subpage-copy > .page-kicker, :scope > .research-subpage-copy > .thermal-points > li, :scope > .research-visual"
      )].filter((item) => !item.classList.contains("research-visual-ar"));
      const arStage = page.querySelector(":scope > .research-visual-ar > .ar-control-stage");
      if (arStage) items.push(arStage);
      return items;
    };

    const setActiveResearchPage = (index) => {
      const next = Math.max(0, Math.min(index, pages.length - 1));
      activePage = next;
      pages.forEach((page, pageIndex) => page.classList.toggle("is-active", pageIndex === activePage));
      rulerButtons.forEach((button, buttonIndex) => {
        const isActive = buttonIndex === activePage;
        button.classList.toggle("active", isActive);
        if (isActive) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });
    };

    const changeResearchPage = async (index) => {
      const target = Math.max(0, Math.min(index, pages.length - 1));
      if (target === activePage || pageSwitching) return;

      pageSwitching = true;
      const outgoing = pages[activePage];
      const incoming = pages[target];
      await fadeList(pageItems(outgoing), false);
      setOpacity(pageItems(incoming), 0);
      // Commit the hidden state before moving the pager. Without this reflow,
      // a previously visited page can paint one stale opacity: 1 frame.
      void incoming.offsetWidth;
      document.dispatchEvent(new CustomEvent("researchpagewillenter", {
        detail: { outgoing, incoming, index: target }
      }));
      if (incoming.querySelector("[data-ar-control]")) {
        await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
      }
      pager.scrollTo({ top: incoming.offsetTop, behavior: "auto" });
      setActiveResearchPage(target);
      await fadeList(pageItems(incoming), true);
      document.dispatchEvent(new CustomEvent("researchpageentered", {
        detail: { outgoing, incoming, index: target }
      }));
      pageSwitching = false;
    };

    pager.addEventListener("wheel", (event) => {
      if (!event.deltaY) return;
      event.preventDefault();
      window.clearTimeout(wheelGestureResetTimer);
      wheelGestureResetTimer = window.setTimeout(() => {
        wheelGestureLocked = false;
        wheelDelta = 0;
      }, 220);
      if (wheelGestureLocked || pageSwitching) return;
      wheelDelta += event.deltaY;
      if (Math.abs(wheelDelta) < 18) return;
      wheelGestureLocked = true;
      changeResearchPage(activePage + (wheelDelta > 0 ? 1 : -1));
    }, { passive: false });

    rulerButtons.forEach((button) => {
      button.addEventListener("click", () => {
        changeResearchPage(Number(button.dataset.researchPageTarget));
      });
    });

    document.addEventListener("researchpagerreset", () => {
      window.clearTimeout(wheelGestureResetTimer);
      wheelGestureLocked = false;
      wheelDelta = 0;
      pageSwitching = false;
      pager.scrollTo({ top: 0, behavior: "auto" });
      setActiveResearchPage(0);
      pages.flatMap(pageItems).forEach((item) => item.style.removeProperty("opacity"));
    });

    pages.forEach((page) => page.querySelector(":scope > .research-visual-ar")?.style.removeProperty("opacity"));
    setActiveResearchPage(0);
  };

  const initLocalLinkAppGallery = () => {
    const gallery = document.querySelector("[data-locallink-app-gallery]");
    const track = gallery?.querySelector(".locallink-app-gallery-track");
    const slides = gallery ? [...gallery.querySelectorAll("[data-locallink-app-shot]")] : [];
    const progressButtons = gallery ? [...gallery.querySelectorAll("[data-locallink-app-gallery-target]")] : [];
    if (!gallery || !track || !slides.length || progressButtons.length !== slides.length) return;

    const loopSlide = slides[0].cloneNode(true);
    loopSlide.classList.add("locallink-app-shot-loop");
    loopSlide.removeAttribute("data-locallink-app-shot");
    loopSlide.removeAttribute("aria-label");
    loopSlide.setAttribute("aria-hidden", "true");
    loopSlide.setAttribute("role", "presentation");
    track.append(loopSlide);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let activeIndex = 0;
    let visualIndex = 0;
    let isVisible = false;
    let isHovered = false;
    let hasFocus = false;

    const updateProgressState = () => {
      gallery.classList.toggle(
        "is-progress-paused",
        !isVisible || isHovered || hasFocus || document.hidden || reducedMotion.matches
      );
    };

    const setTrackPosition = () => {
      gallery.style.setProperty("--locallink-gallery-offset", `${visualIndex * -100}%`);
    };

    const resetLoopPosition = () => {
      if (visualIndex !== slides.length) return;
      gallery.classList.add("is-loop-resetting");
      visualIndex = 0;
      setTrackPosition();
      void track.offsetWidth;
      gallery.classList.remove("is-loop-resetting");
    };

    const render = ({ instant = false } = {}) => {
      gallery.classList.remove("is-progress-ready");
      if (instant) gallery.classList.add("is-loop-resetting");
      setTrackPosition();
      slides.forEach((slide, index) => slide.setAttribute("aria-hidden", String(index !== activeIndex)));
      progressButtons.forEach((button, index) => {
        const isActive = index === activeIndex;
        button.classList.toggle("active", isActive);
        if (isActive) button.setAttribute("aria-current", "true");
        else button.removeAttribute("aria-current");
      });
      void gallery.offsetWidth;
      if (instant) gallery.classList.remove("is-loop-resetting");
      gallery.classList.add("is-progress-ready");
      updateProgressState();
    };

    const showSlide = (index, { instant = false } = {}) => {
      const nextIndex = (index + slides.length) % slides.length;
      const loopsForward = !instant && activeIndex === slides.length - 1 && nextIndex === 0;
      activeIndex = nextIndex;
      visualIndex = loopsForward ? slides.length : activeIndex;
      render({ instant });
      if (loopsForward && reducedMotion.matches) window.requestAnimationFrame(resetLoopPosition);
    };

    track.addEventListener("transitionend", (event) => {
      if (event.propertyName === "transform") resetLoopPosition();
    });

    progressButtons.forEach((button, index) => {
      button.addEventListener("click", () => showSlide(index));
      button.querySelector("span")?.addEventListener("animationend", (event) => {
        if (event.animationName === "locallink-app-gallery-progress" && index === activeIndex) {
          showSlide(activeIndex + 1);
        }
      });
    });
    gallery.addEventListener("mouseenter", () => { isHovered = true; updateProgressState(); });
    gallery.addEventListener("mouseleave", () => { isHovered = false; updateProgressState(); });
    gallery.addEventListener("focusin", (event) => {
      hasFocus = event.target.matches(":focus-visible");
      updateProgressState();
    });
    gallery.addEventListener("focusout", () => window.requestAnimationFrame(() => {
      hasFocus = gallery.contains(document.activeElement) && document.activeElement.matches(":focus-visible");
      updateProgressState();
    }));
    document.addEventListener("visibilitychange", updateProgressState);
    reducedMotion.addEventListener("change", updateProgressState);

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        isVisible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= .35);
        updateProgressState();
      }, { threshold: [0, .35] });
      observer.observe(gallery);
    } else {
      isVisible = true;
    }

    document.addEventListener("locallinkpagerreset", () => {
      showSlide(0, { instant: true });
    });
    render();
  };

  const initLocalLinkPager = () => {
    const section = document.querySelector("#lab-locallink");
    const pager = section?.querySelector("[data-locallink-subpager]");
    if (!section || !pager) return;

    const pages = [...pager.querySelectorAll("[data-locallink-subpage]")];
    const rulerButtons = [...section.querySelectorAll("[data-locallink-page-target]")];
    if (!pages.length || !rulerButtons.length) return;

    const mobileLayout = window.matchMedia("(max-width: 850px)");
    let activePage = 0;
    let pageSwitching = false;
    let wheelGestureLocked = false;
    let wheelGestureResetTimer = 0;
    let wheelDelta = 0;
    const nextPaint = () => new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));

    const pageItems = (page) => [...page.querySelectorAll(
      ":scope > .research-subpage-copy > .page-kicker, :scope > .research-subpage-copy > .thermal-points > li, :scope > .research-visual"
    )];

    const setActivePage = (index) => {
      activePage = Math.max(0, Math.min(index, pages.length - 1));
      pages.forEach((page, pageIndex) => {
        const isActive = pageIndex === activePage;
        page.classList.toggle("is-active", isActive);
        if (mobileLayout.matches) {
          page.removeAttribute("aria-hidden");
          page.removeAttribute("inert");
        } else {
          page.setAttribute("aria-hidden", String(!isActive));
          page.toggleAttribute("inert", !isActive);
        }
      });
      rulerButtons.forEach((button, buttonIndex) => {
        const isActive = buttonIndex === activePage;
        button.classList.toggle("active", isActive);
        if (isActive) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });
    };

    const changePage = async (index) => {
      const target = Math.max(0, Math.min(index, pages.length - 1));
      if (target === activePage || pageSwitching || mobileLayout.matches) return;

      pageSwitching = true;
      const outgoing = pages[activePage];
      const incoming = pages[target];
      await fadeList(pageItems(outgoing), false);
      const incomingItems = pageItems(incoming);
      setOpacity(incomingItems, 0);
      pager.scrollTo({ top: incoming.offsetTop, behavior: "auto" });
      setActivePage(target);
      await nextPaint();
      await fadeList(incomingItems, true);
      pageSwitching = false;
    };

    pager.addEventListener("wheel", (event) => {
      if (mobileLayout.matches || !event.deltaY) return;
      event.preventDefault();
      window.clearTimeout(wheelGestureResetTimer);
      wheelGestureResetTimer = window.setTimeout(() => {
        wheelGestureLocked = false;
        wheelDelta = 0;
      }, 220);
      if (wheelGestureLocked || pageSwitching) return;
      wheelDelta += event.deltaY;
      if (Math.abs(wheelDelta) < 18) return;
      wheelGestureLocked = true;
      changePage(activePage + (wheelDelta > 0 ? 1 : -1));
    }, { passive: false });

    rulerButtons.forEach((button) => {
      button.addEventListener("click", () => changePage(Number(button.dataset.locallinkPageTarget)));
    });

    document.addEventListener("locallinkpagerreset", () => {
      window.clearTimeout(wheelGestureResetTimer);
      wheelGestureLocked = false;
      wheelDelta = 0;
      pageSwitching = false;
      pager.scrollTo({ top: 0, behavior: "auto" });
      setActivePage(0);
      pages.flatMap(pageItems).forEach((item) => item.style.removeProperty("opacity"));
    });

    mobileLayout.addEventListener("change", () => setActivePage(activePage));
    setActivePage(0);
  };

  const initLocalLinkSystemMap = () => {
    const maps = [...document.querySelectorAll("[data-locallink-system-map]")];
    if (!maps.length) return;
    const redraw = (map) => window.requestAnimationFrame(() => {
      if (map.classList.contains("is-animating") || map.classList.contains("is-preparing")) return;
      drawLocalLinkSystemRoutes(map);
      map.classList.add("is-wifi-live");
    });
    window.addEventListener("resize", () => maps.forEach(redraw));
    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver((entries) => entries.forEach((entry) => redraw(entry.target)));
      maps.forEach((map) => observer.observe(map));
    }
    document.fonts?.ready.then(() => maps.forEach(redraw));
    document.addEventListener("sectionentered", (event) => {
      maps
        .filter((map) => map.closest(".page-section") === event.detail?.incoming)
        .forEach(redraw);
    });
    document.addEventListener("viewentered", (event) => {
      maps
        .filter((map) => map.closest(".content-view") === event.detail?.incoming)
        .forEach(redraw);
    });
    maps.forEach(redraw);
  };

  const localLinkMonthColorTokens = [
    "--month-jan", "--month-feb", "--month-mar", "--month-apr", "--month-may", "--month-jun",
    "--month-jul", "--month-aug", "--month-sep", "--month-oct", "--month-nov", "--month-dec"
  ];

  const initLocalLinkCalendar = () => {
    const root = document.querySelector("[data-locallink-calendar]");
    if (!root) return;

    const grid = root.querySelector("[data-locallink-calendar-grid]");
    const monthName = root.querySelector("[data-locallink-calendar-month-name]");
    const dayReadout = root.querySelector("[data-locallink-calendar-day]");
    const weekdayReadout = root.querySelector("[data-locallink-calendar-weekday]");
    const locationLabel = root.querySelector("[data-locallink-calendar-location]");
    const title = root.querySelector("[data-locallink-calendar-title]");
    const yearLabel = root.querySelector("[data-locallink-calendar-year]");
    const todayButton = root.querySelector("[data-locallink-calendar-today]");
    const tableCaption = root.querySelector("[data-locallink-calendar-table-caption]");
    const status = root.querySelector("[data-locallink-calendar-status]");
    const monthButtons = [...root.querySelectorAll("[data-locallink-calendar-month]")];
    if (!grid || !monthName || !dayReadout || !weekdayReadout || !title || !yearLabel || !todayButton || !tableCaption || !status || monthButtons.length !== 12) return;

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const sameDate = (first, second) => Boolean(first && second)
      && first.getFullYear() === second.getFullYear()
      && first.getMonth() === second.getMonth()
      && first.getDate() === second.getDate();
    const fullDateLabel = (date) => `${weekdayNames[date.getDay()]}, ${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;

    const formatLocation = (data) => {
      const candidates = [data?.city, data?.region, data?.country]
        .map((value) => typeof value === "string" ? value.trim().slice(0, 64) : "")
        .filter(Boolean);
      const uniqueParts = candidates.filter((value, index) => candidates.findIndex((candidate) => candidate.toLocaleLowerCase() === value.toLocaleLowerCase()) === index);
      return uniqueParts.slice(0, 2).join(", ");
    };

    const locationProviders = [
      {
        url: "https://get.geojs.io/v1/ip/geo.json",
        failed: (data) => Boolean(data?.error)
      },
      {
        url: "https://ipwho.is/?fields=success,city,region,country&lang=en",
        failed: (data) => data?.success === false
      }
    ];

    const requestIpLocation = async (provider) => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 6000);
      try {
        const response = await fetch(provider.url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Location request failed with ${response.status}`);
        const data = await response.json();
        if (provider.failed(data)) throw new Error("Location lookup was unsuccessful");
        const location = formatLocation(data);
        if (!location) throw new Error("Location lookup returned no locality");
        return location;
      } finally {
        window.clearTimeout(timeout);
      }
    };

    const updateLocalLocation = async () => {
      if (!locationLabel) return;
      locationLabel.textContent = "Locating...";
      locationLabel.setAttribute("aria-busy", "true");
      try {
        for (const provider of locationProviders) {
          try {
            locationLabel.textContent = await requestIpLocation(provider);
            return;
          } catch {
            // Continue to the next IP-only provider.
          }
        }
        locationLabel.textContent = "Location unavailable";
      } finally {
        locationLabel.removeAttribute("aria-busy");
      }
    };

    let today = startOfDay(new Date());
    let viewYear = today.getFullYear();
    let viewMonth = today.getMonth();
    let selectedDate = startOfDay(today);
    let focusDay = today.getDate();
    let readoutTimer = 0;
    const gridCells = [];

    const updateReadout = () => {
      monthName.textContent = monthNames[viewMonth].toUpperCase();
      if (!selectedDate) {
        dayReadout.textContent = "";
        weekdayReadout.textContent = "";
        return;
      }
      dayReadout.textContent = String(selectedDate.getDate());
      weekdayReadout.textContent = weekdayNames[selectedDate.getDay()];
    };

    const swapReadout = (announcement = "") => {
      window.clearTimeout(readoutTimer);
      if (reducedMotion.matches) {
        root.classList.remove("is-readout-switching");
        updateReadout();
        if (announcement) status.textContent = announcement;
        return;
      }

      root.classList.add("is-readout-switching");
      readoutTimer = window.setTimeout(() => {
        updateReadout();
        if (announcement) status.textContent = announcement;
        window.requestAnimationFrame(() => root.classList.remove("is-readout-switching"));
      }, 350);
    };

    const updateDayStates = () => {
      gridCells.forEach((button) => {
        if (button.disabled) return;
        const day = Number(button.dataset.locallinkCalendarDay);
        const date = new Date(viewYear, viewMonth, day);
        const isSelected = sameDate(date, selectedDate);
        const isToday = sameDate(date, today);
        button.classList.toggle("is-selected", isSelected);
        button.classList.toggle("is-today", isToday);
        button.setAttribute("aria-pressed", String(isSelected));
        if (isToday) button.setAttribute("aria-current", "date");
        else button.removeAttribute("aria-current");
        button.tabIndex = day === focusDay ? 0 : -1;
      });
    };

    const handleDayKeydown = (event) => {
      const currentDay = Number(event.currentTarget.dataset.locallinkCalendarDay);
      const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();
      let targetDay = currentDay;
      if (event.key === "ArrowLeft") targetDay -= 1;
      else if (event.key === "ArrowRight") targetDay += 1;
      else if (event.key === "ArrowUp") targetDay -= 7;
      else if (event.key === "ArrowDown") targetDay += 7;
      else if (event.key === "Home") targetDay = 1;
      else if (event.key === "End") targetDay = lastDay;
      else return;
      if (targetDay < 1 || targetDay > lastDay) return;

      event.preventDefault();
      focusDay = targetDay;
      updateDayStates();
      grid.querySelector(`button[data-locallink-calendar-day="${targetDay}"]`)?.focus();
    };

    const createGrid = () => {
      const fragment = document.createDocumentFragment();
      for (let rowIndex = 0; rowIndex < 6; rowIndex += 1) {
        const row = document.createElement("tr");
        for (let columnIndex = 0; columnIndex < 7; columnIndex += 1) {
          const cell = document.createElement("td");
          const button = document.createElement("button");
          button.type = "button";
          button.className = "locallink-calendar-day";
          button.addEventListener("click", () => {
            if (button.disabled) return;
            const day = Number(button.dataset.locallinkCalendarDay);
            focusDay = day;
            selectedDate = new Date(viewYear, viewMonth, day);
            updateDayStates();
            swapReadout(`Selected ${fullDateLabel(selectedDate)}.`);
          });
          button.addEventListener("keydown", handleDayKeydown);
          gridCells.push(button);
          cell.append(button);
          row.append(cell);
        }
        fragment.append(row);
      }
      grid.replaceChildren(fragment);
    };

    const updateGrid = () => {
      const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
      const mondayOffset = (firstWeekday + 6) % 7;
      gridCells.forEach((button, cellIndex) => {
        const date = new Date(viewYear, viewMonth, cellIndex - mondayOffset + 1);
        const isCurrentMonth = date.getFullYear() === viewYear && date.getMonth() === viewMonth;
        button.textContent = String(date.getDate());
        button.classList.toggle("is-outside", !isCurrentMonth);

        if (isCurrentMonth) {
          button.disabled = false;
          button.removeAttribute("aria-hidden");
          button.dataset.locallinkCalendarDay = String(date.getDate());
          button.setAttribute("aria-label", fullDateLabel(date));
        } else {
          button.disabled = true;
          button.setAttribute("aria-hidden", "true");
          button.removeAttribute("aria-label");
          button.removeAttribute("aria-current");
          button.removeAttribute("aria-pressed");
          button.removeAttribute("data-locallink-calendar-day");
          button.classList.remove("is-selected", "is-today");
          button.tabIndex = -1;
        }
      });
      tableCaption.textContent = `Calendar for ${monthNames[viewMonth]} ${viewYear}`;
      updateDayStates();
    };

    const updateMonthControls = () => {
      root.style.setProperty("--locallink-calendar-color", `var(${localLinkMonthColorTokens[viewMonth]})`);
      root.classList.toggle("is-current-month", viewYear === today.getFullYear() && viewMonth === today.getMonth());
      title.textContent = monthNames[viewMonth];
      yearLabel.textContent = String(viewYear);
      monthButtons.forEach((button, monthIndex) => {
        const isActive = monthIndex === viewMonth;
        button.setAttribute("aria-selected", String(isActive));
        button.setAttribute("aria-label", `${monthNames[monthIndex]} ${viewYear}`);
        button.tabIndex = isActive ? 0 : -1;
      });
    };

    const renderMonth = ({ animateReadout = false, announcement = "" } = {}) => {
      updateMonthControls();
      updateGrid();
      if (animateReadout) swapReadout(announcement);
      else {
        updateReadout();
        if (announcement) status.textContent = announcement;
      }
    };

    const activateMonth = (monthIndex, focusButton = false) => {
      if (monthIndex === viewMonth) {
        if (focusButton) monthButtons[monthIndex].focus();
        return;
      }
      viewYear = today.getFullYear();
      viewMonth = monthIndex;
      if (viewMonth === today.getMonth()) {
        selectedDate = startOfDay(today);
        focusDay = today.getDate();
      } else {
        selectedDate = null;
        focusDay = 1;
      }
      renderMonth({
        animateReadout: true,
        announcement: selectedDate
          ? `Showing ${monthNames[viewMonth]} ${viewYear}, selected ${fullDateLabel(selectedDate)}.`
          : `Showing ${monthNames[viewMonth]} ${viewYear}. No date selected.`
      });
      if (focusButton) monthButtons[monthIndex].focus();
    };

    monthButtons.forEach((button, monthIndex) => {
      button.addEventListener("click", () => activateMonth(monthIndex));
      button.addEventListener("keydown", (event) => {
        let targetMonth = monthIndex;
        if (event.key === "ArrowLeft") targetMonth = (monthIndex + 11) % 12;
        else if (event.key === "ArrowRight") targetMonth = (monthIndex + 1) % 12;
        else if (event.key === "Home") targetMonth = 0;
        else if (event.key === "End") targetMonth = 11;
        else return;
        event.preventDefault();
        activateMonth(targetMonth, true);
      });
    });

    todayButton.addEventListener("click", () => {
      today = startOfDay(new Date());
      viewYear = today.getFullYear();
      viewMonth = today.getMonth();
      selectedDate = startOfDay(today);
      focusDay = today.getDate();
      renderMonth({
        animateReadout: true,
        announcement: `Showing today, ${fullDateLabel(today)}.`
      });
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;
      const nextToday = startOfDay(new Date());
      if (sameDate(nextToday, today)) return;
      const wasShowingToday = viewYear === today.getFullYear() && viewMonth === today.getMonth() && sameDate(selectedDate, today);
      today = nextToday;
      if (wasShowingToday) {
        viewYear = today.getFullYear();
        viewMonth = today.getMonth();
        selectedDate = startOfDay(today);
        focusDay = today.getDate();
      }
      renderMonth();
    });

    createGrid();
    renderMonth();
    updateLocalLocation();
  };

  const initLocalLinkMatrix = () => {
    const matrix = document.querySelector("[data-locallink-matrix]");
    if (!matrix) return;

    const width = 32;
    const height = 8;
    const digitPatterns = {
      0: ["111", "101", "101", "101", "111"],
      1: ["010", "110", "010", "010", "111"],
      2: ["111", "001", "111", "100", "111"],
      3: ["111", "001", "111", "001", "111"],
      4: ["101", "101", "111", "001", "001"],
      5: ["111", "100", "111", "001", "111"],
      6: ["111", "100", "111", "101", "111"],
      7: ["111", "001", "010", "010", "010"],
      8: ["111", "101", "111", "101", "111"],
      9: ["111", "101", "111", "001", "111"]
    };
    const cells = Array.from({ length: width * height }, () => {
      const cell = document.createElement("i");
      cell.className = "locallink-led-cell";
      return cell;
    });
    matrix.replaceChildren(...cells);

    const setPixel = (x, y) => {
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      cells[y * width + x].classList.add("is-on");
    };
    const drawDigit = (value, startX, startY) => {
      digitPatterns[value].forEach((row, y) => {
        [...row].forEach((pixel, x) => {
          if (pixel === "1") setPixel(startX + x, startY + y);
        });
      });
    };
    const renderClock = () => {
      cells.forEach((cell) => cell.classList.remove("is-on"));
      const now = new Date();
      const digits = String(now.getHours()).padStart(2, "0") + String(now.getMinutes()).padStart(2, "0");
      [6, 10, 18, 22].forEach((x, index) => drawDigit(Number(digits[index]), x, 1));
      setPixel(15, 2);
      setPixel(15, 4);
    };

    renderClock();
    window.setInterval(renderClock, 30000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) renderClock();
    });
  };

  const initPhotographyGalleries = () => {
    const galleries = [...document.querySelectorAll(".photography-gallery")];
    if (!galleries.length) return;

    const galleryStates = galleries.map((gallery) => {
      const sheet = gallery.querySelector(".photography-contact-sheet");
      if (!sheet) return null;
      const contentPanel = gallery.closest(".content-panel");
      const frames = [...sheet.querySelectorAll(":scope > .photography-frame")];
      frames.forEach((frame) => {
        const originalSource = frame.getAttribute("href");
        readPhotographyMetadata(frame);
        if (originalSource) frame.dataset.photographyOriginalSrc = originalSource;
        frame.removeAttribute("href");
        frame.removeAttribute("target");
        frame.removeAttribute("rel");
        frame.hidden = false;
      });
      let layoutFrame = 0;
      let scrollAnimationFrame = 0;
      let scrollTarget = 0;
      let focusedFrame = null;
      let focusClone = null;
      let focusCleanupTimer = 0;
      let focusClosing = false;

      const setCloneRect = (clone, rect) => {
        clone.style.left = `${rect.left}px`;
        clone.style.top = `${rect.top}px`;
        clone.style.width = `${rect.width}px`;
        clone.style.height = `${rect.height}px`;
      };

      const focusTargetRect = () => {
        const galleryRect = gallery.getBoundingClientRect();
        const stage = contentPanel?.getBoundingClientRect() || galleryRect;
        const primaryNavRect = contentPanel
          ?.querySelector(".primary-nav-frame")
          ?.getBoundingClientRect();
        const desktopStage = window.innerWidth > 850;
        const navGap = Number.parseFloat(
          getComputedStyle(contentPanel || document.documentElement).getPropertyValue("--nav-gap")
        ) || 30;
        const edgeGap = desktopStage ? navGap : 14;
        const safeLeft = stage.left + edgeGap;
        const safeRight = stage.right - edgeGap;
        const safeTop = desktopStage
          ? (primaryNavRect?.bottom || stage.top) + edgeGap
          : galleryRect.top + edgeGap;
        const safeBottom = stage.bottom - edgeGap;
        const availableWidth = Math.max(1, safeRight - safeLeft);
        const availableHeight = Math.max(1, safeBottom - safeTop);
        const width = Math.min(availableWidth, availableHeight * 1.5);
        const height = width / 1.5;
        return {
          left: safeRight - width,
          top: safeTop,
          width,
          height
        };
      };

      const finishPhotoFocus = (seamlessSwap = false) => {
        if (focusCleanupTimer) window.clearTimeout(focusCleanupTimer);
        focusCleanupTimer = 0;
        const sourceFrame = focusedFrame;
        if (sourceFrame) {
          if (seamlessSwap) sourceFrame.style.transition = "none";
          sourceFrame.classList.remove("is-focus-source");
          sourceFrame.setAttribute("aria-expanded", "false");
          if (seamlessSwap) {
            void sourceFrame.offsetWidth;
            window.requestAnimationFrame(() => sourceFrame.style.removeProperty("transition"));
          }
        }
        focusClone?.remove();
        focusClone = null;
        focusedFrame = null;
        focusClosing = false;
      };

      const closePhotoFocus = (animate = true) => {
        if (!focusedFrame || !focusClone) return;
        if (focusClosing) {
          if (!animate) finishPhotoFocus();
          return;
        }
        focusClosing = true;
        sheet.classList.remove("is-photo-focused");
        gallery.classList.remove("is-photo-focused");
        focusClone.classList.add("is-closing");

        if (!animate || reduceMotion || !focusedFrame.isConnected || !gallery.offsetParent) {
          finishPhotoFocus();
          return;
        }

        setCloneRect(focusClone, focusedFrame.getBoundingClientRect());
        focusClone.addEventListener("transitionend", (event) => {
          if (event.propertyName === "width" && focusClosing) finishPhotoFocus(true);
        });
        focusCleanupTimer = window.setTimeout(() => finishPhotoFocus(true), 560);
      };

      const openPhotoFocus = (frame) => {
        if (focusedFrame === frame) {
          closePhotoFocus();
          return;
        }
        if (focusedFrame || !gallery.offsetParent) return;
        if (scrollAnimationFrame) window.cancelAnimationFrame(scrollAnimationFrame);
        scrollAnimationFrame = 0;
        scrollTarget = gallery.scrollTop;

        const startRect = frame.getBoundingClientRect();
        const clone = frame.cloneNode(true);
        clone.classList.add("photography-focus-clone");
        clone.removeAttribute("role");
        clone.removeAttribute("tabindex");
        clone.removeAttribute("aria-expanded");
        clone.setAttribute("aria-label", "Close enlarged photograph");
        setCloneRect(clone, startRect);
        document.body.append(clone);

        const cloneImage = clone.querySelector("img");
        const originalSource = frame.dataset.photographyOriginalSrc;
        if (cloneImage && originalSource) {
          window.setTimeout(async () => {
            if (focusClone !== clone || focusClosing) return;
            const fullImage = new Image();
            fullImage.decoding = "async";
            fullImage.src = originalSource;
            try {
              await fullImage.decode();
            } catch {
              return;
            }
            if (focusClone === clone && !focusClosing) cloneImage.src = fullImage.src;
          }, reduceMotion ? 0 : 480);
        }

        focusedFrame = frame;
        focusClone = clone;
        frame.classList.add("is-focus-source");
        frame.setAttribute("aria-expanded", "true");
        sheet.classList.add("is-photo-focused");
        gallery.classList.add("is-photo-focused");
        clone.addEventListener("click", () => closePhotoFocus(), { once: true });

        void clone.offsetWidth;
        if (reduceMotion) setCloneRect(clone, focusTargetRect());
        else window.requestAnimationFrame(() => setCloneRect(clone, focusTargetRect()));
      };

      const concealPhotoFocusForLeave = () => {
        if (!focusedFrame && !focusClone) return;
        if (focusCleanupTimer) window.clearTimeout(focusCleanupTimer);
        focusCleanupTimer = 0;
        sheet.classList.add("is-photo-focused");
        gallery.classList.remove("is-photo-focused");
        if (focusedFrame) {
          focusedFrame.classList.remove("is-focus-source");
          focusedFrame.setAttribute("aria-expanded", "false");
        }
        focusClosing = true;
        if (!focusClone || reduceMotion) {
          finishPhotoFocus();
          return;
        }
        focusClone.classList.add("is-leaving");
        focusCleanupTimer = window.setTimeout(() => finishPhotoFocus(), 280);
      };

      const resetScroll = () => {
        if (scrollAnimationFrame) window.cancelAnimationFrame(scrollAnimationFrame);
        scrollAnimationFrame = 0;
        scrollTarget = 0;
        resetPhotographyGallery(gallery);
      };

      const animateScroll = () => {
        const distance = scrollTarget - gallery.scrollTop;
        if (Math.abs(distance) < .5) {
          gallery.scrollTop = scrollTarget;
          scrollAnimationFrame = 0;
          return;
        }
        gallery.scrollTop += distance * .2;
        scrollAnimationFrame = window.requestAnimationFrame(animateScroll);
      };

      const updateLayout = () => {
        layoutFrame = 0;
        if (!gallery.offsetParent) return;
        const width = gallery.clientWidth;
        if (width < 1) return;
        const compact = width < 560;
        const gap = Math.max(10, Math.min(18, width * .012));
        const minimumWidth = compact ? 145 : Math.max(190, Math.min(260, width * .26));
        const columns = Math.max(1, Math.min(compact ? 2 : 3, Math.floor((width + gap) / (minimumWidth + gap))));
        const widthBasedPhotoWidth = (width - gap * (columns - 1)) / columns;
        const galleryHeight = gallery.clientHeight;
        const heightBasedPhotoWidth = galleryHeight > gap + 2
          ? ((galleryHeight - gap - 2) / 2) * 1.5
          : widthBasedPhotoWidth;
        const photoWidth = Math.min(widthBasedPhotoWidth, heightBasedPhotoWidth);
        sheet.style.setProperty("--photography-columns", String(columns));
        sheet.style.setProperty("--photography-photo-width", `${photoWidth}px`);
        sheet.style.setProperty("--photography-gap", `${gap}px`);
        if (contentPanel) contentPanel.scrollTop = 0;
        resetScroll();
        if (focusClone && !focusClosing) setCloneRect(focusClone, focusTargetRect());
      };

      const scheduleLayout = () => {
        if (layoutFrame) window.cancelAnimationFrame(layoutFrame);
        layoutFrame = window.requestAnimationFrame(updateLayout);
      };

      if ("ResizeObserver" in window) new ResizeObserver(scheduleLayout).observe(gallery);
      else window.addEventListener("resize", scheduleLayout);
      gallery.addEventListener("scroll", () => {
        if (!scrollAnimationFrame) scrollTarget = gallery.scrollTop;
      }, { passive: true });
      gallery.addEventListener("wheel", (event) => {
        if (focusedFrame) {
          event.preventDefault();
          return;
        }
        if (!event.deltaY || event.ctrlKey) return;
        const maximumScroll = Math.max(0, gallery.scrollHeight - gallery.clientHeight);
        if (!maximumScroll) return;
        event.preventDefault();
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? gallery.clientHeight : 1;
        const start = scrollAnimationFrame ? scrollTarget : gallery.scrollTop;
        scrollTarget = Math.max(0, Math.min(maximumScroll, start + event.deltaY * unit));
        if (reduceMotion) {
          gallery.scrollTop = scrollTarget;
          return;
        }
        if (!scrollAnimationFrame) scrollAnimationFrame = window.requestAnimationFrame(animateScroll);
      }, { passive: false });
      frames.forEach((frame) => {
        frame.setAttribute("role", "button");
        frame.setAttribute("tabindex", "0");
        frame.setAttribute("aria-expanded", "false");
        frame.addEventListener("click", (event) => {
          event.preventDefault();
          openPhotoFocus(frame);
        });
        frame.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          openPhotoFocus(frame);
        });
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && focusedFrame) closePhotoFocus();
      });
      scheduleLayout();

      return {
        gallery,
        leave: concealPhotoFocusForLeave,
        reset: () => {
          closePhotoFocus(false);
          sheet.classList.remove("is-photo-focused");
          gallery.classList.remove("is-photo-focused");
          frames.forEach((frame) => {
            frame.classList.remove("is-focus-source");
            frame.setAttribute("aria-expanded", "false");
          });
          if (contentPanel) contentPanel.scrollTop = 0;
          resetScroll();
          scheduleLayout();
        }
      };
    }).filter(Boolean);

    const resetOutgoingGallery = (event) => {
      const outgoing = event.detail?.outgoing;
      galleryStates.forEach((state) => {
        if (outgoing?.contains(state.gallery)) state.leave();
      });
    };
    const refreshIncomingGallery = (event) => {
      const incoming = event.detail?.incoming;
      const outgoing = event.detail?.outgoing;
      galleryStates.forEach((state) => {
        if (incoming?.contains(state.gallery) || outgoing?.contains(state.gallery)) state.reset();
      });
    };
    document.addEventListener("viewleaving", resetOutgoingGallery);
    document.addEventListener("sectionleaving", resetOutgoingGallery);
    document.addEventListener("viewentered", refreshIncomingGallery);
    document.addEventListener("sectionentered", refreshIncomingGallery);
  };

  const initMiddleMouseGuard = () => {
    const blockMiddleMouse = (event) => {
      if (event.button !== 1 || !(event.target instanceof Element)) return;
      if (!event.target.closest(".portfolio, .photography-focus-clone")) return;
      event.preventDefault();
      event.stopPropagation();
    };
    ["pointerdown", "mousedown", "mouseup", "auxclick"].forEach((type) => {
      document.addEventListener(type, blockMiddleMouse, { capture: true });
    });
  };

  const initPublicationsPager = () => {
    const pager = document.querySelector("[data-publications-pager]");
    if (!pager) return;

    const pages = [...pager.querySelectorAll("[data-publications-page]")];
    const buttons = [...document.querySelectorAll("[data-publications-page-target]")];
    if (!pages.length || !buttons.length) return;

    let activePage = 0;
    let switching = false;
    let wheelLocked = false;
    let wheelResetTimer = 0;
    let wheelDelta = 0;
    const pageItems = (page) => [...page.querySelectorAll(":scope > .publication-card")];
    const setActivePage = (index) => {
      activePage = Math.max(0, Math.min(index, pages.length - 1));
      pages.forEach((page, pageIndex) => {
        const isActive = pageIndex === activePage;
        page.classList.toggle("is-active", isActive);
        page.setAttribute("aria-hidden", String(!isActive));
        page.toggleAttribute("inert", !isActive);
      });
      buttons.forEach((button, buttonIndex) => {
        const isActive = buttonIndex === activePage;
        button.classList.toggle("active", isActive);
        if (isActive) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });
    };

    const changePage = async (index) => {
      const target = Math.max(0, Math.min(index, pages.length - 1));
      if (target === activePage || switching) return;
      switching = true;
      const outgoing = pages[activePage];
      const incoming = pages[target];
      await animatePublicationCards(pageItems(outgoing), false);
      const incomingCards = pageItems(incoming);
      setOpacity(incomingCards, 0);
      setActivePage(target);
      await animatePublicationCards(incomingCards, true);
      switching = false;
    };

    pager.addEventListener("wheel", (event) => {
      if (!event.deltaY) return;
      event.preventDefault();
      window.clearTimeout(wheelResetTimer);
      wheelResetTimer = window.setTimeout(() => {
        wheelLocked = false;
        wheelDelta = 0;
      }, 220);
      if (wheelLocked || switching) return;
      wheelDelta += event.deltaY;
      if (Math.abs(wheelDelta) < 18) return;
      wheelLocked = true;
      changePage(activePage + (wheelDelta > 0 ? 1 : -1));
    }, { passive: false });

    pager.addEventListener("keydown", (event) => {
      const direction = ["ArrowRight", "ArrowDown", "PageDown"].includes(event.key)
        ? 1
        : ["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key) ? -1 : 0;
      if (!direction) return;
      event.preventDefault();
      changePage(activePage + direction);
    });

    buttons.forEach((button) => {
      button.addEventListener("click", () => changePage(Number(button.dataset.publicationsPageTarget)));
    });

    document.addEventListener("publicationspagerreset", () => {
      window.clearTimeout(wheelResetTimer);
      wheelLocked = false;
      wheelDelta = 0;
      switching = false;
      pages.forEach((page) => page.style.removeProperty("opacity"));
      setActivePage(0);
      pages.flatMap(pageItems).forEach((item) => item.style.removeProperty("opacity"));
    });

    setActivePage(0);
  };

  const initAcousticDemo = () => {
    const acousticCanvases = [...document.querySelectorAll("[data-acoustic-canvas]")];
    if (!acousticCanvases.length) return;
    const safariCanvas = /Apple/i.test(navigator.vendor || "")
      && /Safari/i.test(navigator.userAgent)
      && !/(Chrome|Chromium|CriOS|Edg|EdgiOS|OPR|FxiOS)/i.test(navigator.userAgent);
    const scanCanvas = acousticCanvases.find((canvas) => canvas.dataset.acousticCanvas === "scan") || null;
    const canvases = acousticCanvases.filter((canvas) => canvas !== scanCanvas);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const initialStart = performance.now();
    const starts = new WeakMap(acousticCanvases.map((canvas) => [
      canvas,
      canvas.dataset.acousticCanvas === "apl" ? initialStart + acousticAplIntroHoldMs : initialStart
    ]));
    const states = new WeakMap();
    const echoRunning = new WeakMap();
    const safariWaveSurfaces = new WeakMap();

    const setup = (canvas) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(rect.width * ratio);
      const height = Math.round(rect.height * ratio);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const context = canvas.getContext("2d");
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const style = getComputedStyle(document.body);
      const bullet = canvas.closest("[data-acoustic-subpage]")?.querySelector(".thermal-points");
      const bulletStyle = bullet ? getComputedStyle(bullet) : style;
      const state = {
        canvas,
        context,
        ratio,
        width: rect.width,
        height: rect.height,
        accent: style.getPropertyValue("--accent").trim(),
        paper: style.getPropertyValue("--paper").trim(),
        heading: style.getPropertyValue("--heading").trim(),
        muted: style.getPropertyValue("--muted").trim(),
        faint: style.getPropertyValue("--faint").trim(),
        line: style.getPropertyValue("--line").trim(),
        aplBody: style.getPropertyValue("--apl-body").trim(),
        bulletColor: bulletStyle.color,
        bulletFamily: bulletStyle.fontFamily,
        bulletSize: parseFloat(bulletStyle.fontSize) || 16,
        bulletWeight: bulletStyle.fontWeight || "400"
      };
      states.set(canvas, state);
      return state;
    };

    const prepareSafariWaveSurface = (state) => {
      let surface = safariWaveSurfaces.get(state.canvas);
      if (!surface) {
        const canvas = document.createElement("canvas");
        surface = { canvas, context: canvas.getContext("2d") };
        safariWaveSurfaces.set(state.canvas, surface);
      }
      if (surface.canvas.width !== state.canvas.width || surface.canvas.height !== state.canvas.height) {
        surface.canvas.width = state.canvas.width;
        surface.canvas.height = state.canvas.height;
      }
      surface.context.setTransform(1, 0, 0, 1, 0, 0);
      surface.context.clearRect(0, 0, surface.canvas.width, surface.canvas.height);
      surface.context.setTransform(state.ratio, 0, 0, state.ratio, 0, 0);
      return surface;
    };

    const roundedRect = (context, x, y, width, height, radius) => {
      context.beginPath();
      context.roundRect(x, y, width, height, radius);
    };

    const echoHeatmap = document.createElement("canvas");
    echoHeatmap.width = 96;
    echoHeatmap.height = 64;
    const heatmapContext = echoHeatmap.getContext("2d");
    const heatmapImage = heatmapContext.createImageData(echoHeatmap.width, echoHeatmap.height);
    const rgbChannels = (color) => {
      const channels = color.match(/[\d.]+/g)?.map(Number) || [];
      return channels.length >= 3 ? channels.slice(0, 3) : [78, 218, 122];
    };
    let echoHeatmapAspect = 0;
    let echoHeatmapAccent = "";
    const renderEchoHeatmap = (displayAspect, accent) => {
      if (Math.abs(displayAspect - echoHeatmapAspect) < .01 && accent === echoHeatmapAccent) return;
      echoHeatmapAspect = displayAspect;
      echoHeatmapAccent = accent;
      const [red, green, blue] = rgbChannels(accent);
      const hotspotXRadius = .06;
      const hotspotYRadius = hotspotXRadius * displayAspect;
      for (let row = 0; row < echoHeatmap.height; row += 1) {
        for (let column = 0; column < echoHeatmap.width; column += 1) {
          const nx = column / (echoHeatmap.width - 1);
          const ny = row / (echoHeatmap.height - 1);
          const surfaceBand = .27 * Math.exp(-Math.pow((ny - .29) / .15, 2));
          const pipeHotspot = .46 * Math.exp(-Math.pow((nx - .61) / hotspotXRadius, 2) - Math.pow((ny - .24) / hotspotYRadius, 2));
          const leftResponse = .05 * Math.exp(-Math.pow((nx - .17) / .1, 2) - Math.pow((ny - .25) / .13, 2));
          const pipePlume = .06 * Math.exp(-Math.pow((nx - .61) / .14, 2) - Math.pow((ny - .54) / .34, 2));
          const lowPocket = -.02 * Math.exp(-Math.pow((nx - .77) / .11, 2) - Math.pow((ny - .67) / .16, 2));
          const texture = .002 * Math.sin(nx * 23 + ny * 17) + .0015 * Math.sin(nx * 51 - ny * 31);
          const value = Math.max(0, Math.min(1, .08 + surfaceBand + pipeHotspot + leftResponse + pipePlume + lowPocket + texture));
          const energy = Math.pow(Math.max(0, (value - .08) / .92), 1.18);
          const offset = (row * echoHeatmap.width + column) * 4;
          heatmapImage.data[offset] = red;
          heatmapImage.data[offset + 1] = green;
          heatmapImage.data[offset + 2] = blue;
          heatmapImage.data[offset + 3] = Math.round(255 * energy);
        }
      }
      heatmapContext.putImageData(heatmapImage, 0, 0);
    };

    const label = (state, text, x, y, align = "left", strong = false) => {
      const { context } = state;
      context.fillStyle = strong ? state.heading : state.faint;
      context.font = `${strong ? 600 : 500} ${strong ? 12 : 10}px "IBM Plex Mono", monospace`;
      context.textAlign = align;
      context.textBaseline = "middle";
      context.fillText(text, x, y);
    };

    const bulletLabel = (state, text, x, y, align = "left") => {
      const { context } = state;
      context.fillStyle = state.bulletColor;
      context.font = `${state.bulletWeight} ${state.bulletSize}px ${state.bulletFamily}`;
      context.textAlign = align;
      context.textBaseline = "middle";
      context.fillText(text, x, y);
    };

    const drawAcousticTag = (state, { text, x, y, anchorX, anchorY, side = "right", width = 132 }) => {
      const { context } = state;
      const lines = text === "ULTRASONIC WAVE EMITTER" ? ["ULTRASONIC WAVE", "EMITTER"] : [text];
      const fontSize = Math.max(12, Math.min(14, width * .105));
      const singleLineHeight = width * .28;
      const height = lines.length > 1 ? singleLineHeight * 1.55 : singleLineHeight;
      const lineHeight = fontSize * .95;
      const left = x - width / 2;
      const top = y - height / 2;
      const portX = side === "right" ? left : left + width;

      context.save();
      context.strokeStyle = state.muted;
      context.globalAlpha = .7;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(anchorX, anchorY);
      context.lineTo(portX, y);
      context.stroke();

      context.globalAlpha = .12;
      context.fillStyle = state.accent;
      roundedRect(context, left, top, width, height, 6);
      context.fill();
      context.globalAlpha = .7;
      context.strokeStyle = state.accent;
      context.lineWidth = 1.25;
      context.stroke();

      context.globalAlpha = 1;
      context.fillStyle = state.muted;
      context.font = `500 ${fontSize}px "IBM Plex Mono", monospace`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      lines.forEach((line, index) => {
        context.fillText(line, x, y + (index - (lines.length - 1) / 2) * lineHeight);
      });
      context.restore();
    };

    const drawGround = (state, groundY) => {
      const { context, width, height } = state;
      context.clearRect(0, 0, width, height);
      context.fillStyle = `color-mix(in srgb, ${state.heading} 3%, transparent)`;
      context.fillRect(0, groundY, width, height - groundY);
      context.strokeStyle = state.line;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, groundY + .5);
      context.lineTo(width, groundY + .5);
      context.stroke();
    };

    const drawPipe = (state, x, y, radius, reveal = 1) => {
      const { context } = state;
      context.save();
      context.globalAlpha = .18 + .82 * reveal;
      context.fillStyle = `color-mix(in srgb, ${state.accent} 18%, transparent)`;
      context.strokeStyle = state.accent;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.globalCompositeOperation = "destination-out";
      context.fillStyle = "#000";
      context.beginPath();
      context.arc(x, y, radius * .64, 0, Math.PI * 2);
      context.fill();
      context.globalCompositeOperation = "source-over";
      context.strokeStyle = `color-mix(in srgb, ${state.heading} 24%, transparent)`;
      context.lineWidth = 1;
      context.stroke();
      context.restore();
    };

    const drawApl = (state, x, groundY, scale = 1) => {
      const { context } = state;
      const s = Math.min(scale, Math.max(.44, (groundY - 8) / 190));
      const left = x - 42 * s;
      const top = groundY - 188 * s;
      const baseX = x + 30 * s;
      const pivotX = x + 35 * s;
      const pivotY = groundY - 47 * s;
      const rodBendX = x + 23 * s;
      const rodBendY = groundY - 158 * s;
      const soilColor = `color-mix(in srgb, ${state.heading} 3%, transparent)`;
      context.save();

      // Low, load-bearing foot plate.
      context.fillStyle = soilColor;
      context.strokeStyle = state.muted;
      context.lineWidth = 1.2;
      roundedRect(context, x - 42 * s, groundY - 14 * s, 78 * s, 10 * s, 3 * s);
      context.fill();
      context.stroke();

      // Protective mechanism housing above the rear of the plate.
      context.beginPath();
      context.moveTo(baseX - 20 * s, groundY - 14 * s);
      context.lineTo(baseX - 20 * s, groundY - 61 * s);
      context.quadraticCurveTo(baseX - 18 * s, groundY - 69 * s, baseX - 9 * s, groundY - 70 * s);
      context.lineTo(baseX + 23 * s, groundY - 70 * s);
      context.quadraticCurveTo(baseX + 29 * s, groundY - 69 * s, baseX + 30 * s, groundY - 62 * s);
      context.lineTo(baseX + 34 * s, groundY - 14 * s);
      context.closePath();
      context.fillStyle = soilColor;
      context.fill();
      context.strokeStyle = state.muted;
      context.stroke();

      // Tall bent linkage and the short lower linkage visible in the reference.
      context.strokeStyle = `color-mix(in srgb, ${state.accent} 70%, transparent)`;
      context.lineWidth = 8 * s;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      context.moveTo(pivotX, pivotY);
      context.lineTo(rodBendX, rodBendY);
      context.lineTo(x + 34 * s, groundY - 174 * s);
      context.lineTo(x + 68 * s, groundY - 188 * s);
      context.stroke();
      context.beginPath();
      context.moveTo(pivotX, pivotY);
      context.lineTo(x + 51 * s, groundY - 13 * s);
      context.lineTo(x + 66 * s, groundY - 25 * s);
      context.stroke();

      // Pivot detail.
      context.fillStyle = state.accent;
      context.strokeStyle = state.muted;
      context.lineWidth = 1.2;
      context.beginPath();
      context.arc(pivotX, pivotY, 7 * s, 0, Math.PI * 2);
      context.fill();
      context.stroke();

      // Rugged Toughpad mounted at the top of the linkage.
      context.save();
      context.translate(x + 70 * s, groundY - 189 * s);
      context.rotate(-.38);
      context.fillStyle = soilColor;
      context.strokeStyle = state.muted;
      context.lineWidth = 1.2;
      roundedRect(context, -7 * s, -9 * s, 50 * s, 18 * s, 3 * s);
      context.fill();
      context.stroke();
      context.restore();

      // The emitter and accelerometer share the contact end of the foot plate.
      const emitterX = x - 13 * s;
      const sensorY = groundY - 4 * s;
      context.fillStyle = state.accent;
      context.beginPath();
      context.arc(emitterX, sensorY, 4.5 * s, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = state.paper;
      context.strokeStyle = state.accent;
      context.lineWidth = 1.5;
      roundedRect(context, x + 4 * s, groundY - 10 * s, 9 * s, 7 * s, 1.5 * s);
      context.fill();
      context.stroke();
      context.restore();
      return {
        left,
        top,
        width: 135 * s,
        height: 188 * s,
        sensorX: emitterX,
        sensorY,
        toughpadX: x + 86 * s,
        toughpadY: groundY - 192 * s,
        linkageX: rodBendX,
        linkageY: groundY - 116 * s,
        pedalX: x - 25 * s,
        pedalY: groundY - 10 * s,
        accelerometerX: x + 8.5 * s,
        accelerometerY: groundY - 6.5 * s,
        accelerometerWidth: 9 * s,
        accelerometerHeight: 7 * s
      };
    };

    const acousticReferencePhaseMs = 3600;
    const acousticWaveTiming = (state, emitterX, groundY, contactX, contactY) => ({
      count: 3,
      stagger: .075,
      travel: Math.hypot(contactX - emitterX, contactY - groundY) / Math.max(1, state.width * 1.25),
      capture: .085
    });

    const pipeContactPoint = (emitterX, emitterY, pipeX, pipeY, pipeRadius) => {
      const towardEmitterX = emitterX - pipeX;
      const towardEmitterY = emitterY - pipeY;
      const distance = Math.max(1, Math.hypot(towardEmitterX, towardEmitterY));
      return {
        x: pipeX + towardEmitterX / distance * pipeRadius,
        y: pipeY + towardEmitterY / distance * pipeRadius
      };
    };

    const drawWavefront = (state, emitterX, groundY, contactX, contactY, progress, returning = false, clipBottom = state.height) => {
      const { context } = state;
      const centerX = returning ? contactX : emitterX;
      const centerY = returning ? contactY : groundY;
      const eased = progress;
      const travelDistance = Math.hypot(contactX - emitterX, contactY - groundY);
      const radius = Math.max(2, travelDistance * eased);
      const opacityProgress = returning ? Math.min(1, progress + .035) : progress;
      const opacity = Math.pow(Math.sin(Math.PI * opacityProgress), .72);
      context.save();
      context.beginPath();
      context.rect(0, groundY, state.width, Math.max(0, clipBottom - groundY));
      context.clip();
      context.strokeStyle = state.accent;
      const waveWidth = 1.35 + (1 - eased) * 1.1;
      const traceWave = () => {
        context.beginPath();
        context.arc(centerX, centerY, radius, 0, returning ? Math.PI * 2 : Math.PI);
        context.stroke();
      };
      if (safariCanvas) {
        context.shadowBlur = 0;
        [
          { width: waveWidth + 6, alpha: opacity * .1 },
          { width: waveWidth + 3, alpha: opacity * .2 },
          { width: waveWidth, alpha: opacity }
        ].forEach((layer) => {
          context.lineWidth = layer.width;
          context.globalAlpha = layer.alpha;
          traceWave();
        });
      } else {
        context.shadowColor = state.accent;
        context.globalAlpha = opacity;
        context.lineWidth = waveWidth;
        context.shadowBlur = 7 * opacity;
        traceWave();
      }
      context.restore();
    };

    const drawPulseEchoTrain = (state, emitterX, groundY, contactX, contactY, progress, clipBottom = state.height) => {
      const timing = acousticWaveTiming(state, emitterX, groundY, contactX, contactY);
      const safariSurface = safariCanvas ? prepareSafariWaveSurface(state) : null;
      const waveState = safariSurface ? { ...state, context: safariSurface.context } : state;
      for (let wave = 0; wave < timing.count; wave += 1) {
        const start = wave * timing.stagger;
        const outgoing = (progress - start) / timing.travel;
        if (outgoing >= 0 && outgoing <= 1) {
          drawWavefront(waveState, emitterX, groundY, contactX, contactY, outgoing, false, clipBottom);
        }
        const reflected = (progress - start - timing.travel) / timing.travel;
        if (reflected >= 0 && reflected <= 1) {
          drawWavefront(waveState, emitterX, groundY, contactX, contactY, reflected, true, clipBottom);
        }
      }
      if (safariSurface) {
        const sourceTop = Math.max(0, Math.ceil((groundY + .5) * state.ratio));
        const sourceBottom = Math.min(safariSurface.canvas.height, Math.floor((clipBottom - .5) * state.ratio));
        if (sourceBottom > sourceTop) {
          const destinationTop = sourceTop / state.ratio;
          const destinationHeight = (sourceBottom - sourceTop) / state.ratio;
          state.context.drawImage(
            safariSurface.canvas,
            0,
            sourceTop,
            safariSurface.canvas.width,
            sourceBottom - sourceTop,
            0,
            destinationTop,
            state.width,
            destinationHeight
          );
        }
      }
      return timing;
    };

    const drawAccelerometerBreath = (state, rig, progress, timing) => {
      let strength = 0;
      for (let wave = 0; wave < timing.count; wave += 1) {
        const arrival = wave * timing.stagger + timing.travel * 2;
        const local = (progress - arrival) / timing.capture;
        if (local >= 0 && local <= 1) {
          const level = local < .28
            ? local / .28
            : Math.pow(1 - (local - .28) / .72, .65);
          strength = Math.max(strength, level);
        }
      }
      if (strength <= 0) return;
      const { context } = state;
      context.save();
      context.translate(rig.accelerometerX, rig.accelerometerY);
      context.strokeStyle = state.accent;
      context.globalAlpha = strength;
      context.shadowColor = state.accent;
      context.shadowBlur = strength * 48;
      roundedRect(
        context,
        -rig.accelerometerWidth / 2,
        -rig.accelerometerHeight / 2,
        rig.accelerometerWidth,
        rig.accelerometerHeight,
        1.5
      );
      context.lineWidth = 1.8;
      context.stroke();
      context.globalAlpha = .85 * strength;
      context.shadowBlur = strength * 18;
      context.stroke();
      context.restore();
    };

    const drawAplIntro = (state, time) => {
      const { context, width, height } = state;
      const groundY = height * .67;
      drawGround(state, groundY);
      const rig = drawApl(state, width * .5, groundY, Math.min(1.2, width / 600));
      const pipeY = groundY + (height - groundY) * .66;
      const pipeRadius = Math.min(30, width * .045, (height - groundY) * .2);
      const pipeX = rig.sensorX + Math.min(64, width * .085);
      drawPipe(state, pipeX, pipeY, pipeRadius);
      const tagWidth = Math.max(112, Math.min(138, width * .2));
      const leftTagX = Math.max(tagWidth / 2 + 4, rig.left - tagWidth * .58);
      const rightTagX = Math.min(width - tagWidth / 2 - 4, rig.left + rig.width + tagWidth * .58);
      const components = [
        { text: "TOUGHPAD", x: rightTagX, y: rig.top + 9, anchorX: rig.toughpadX, anchorY: rig.toughpadY, side: "right", width: tagWidth },
        { text: "LINKAGE", x: leftTagX, y: rig.linkageY, anchorX: rig.linkageX, anchorY: rig.linkageY, side: "left", width: tagWidth },
        { text: "ACCELEROMETER", x: rightTagX, y: groundY - 65, anchorX: rig.accelerometerX, anchorY: rig.accelerometerY, side: "right", width: tagWidth },
        { text: "ULTRASONIC WAVE EMITTER", x: leftTagX, y: groundY - tagWidth * .22 - 12, anchorX: rig.sensorX, anchorY: rig.sensorY, side: "left", width: tagWidth }
      ];
      components.forEach((component) => drawAcousticTag(state, component));
      if (!reduceMotion.matches && time < 0) return;
      const phase = reduceMotion.matches ? .64 : (time % acousticReferencePhaseMs) / acousticReferencePhaseMs;
      const contact = pipeContactPoint(rig.sensorX, groundY, pipeX, pipeY, pipeRadius);
      const timing = drawPulseEchoTrain(state, rig.sensorX, groundY, contact.x, contact.y, phase);
      drawPipe(state, pipeX, pipeY, pipeRadius);
      drawAccelerometerBreath(state, rig, phase, timing);
    };

    const drawEcho = (state, time) => {
      const { context, width, height } = state;
      context.clearRect(0, 0, width, height);
      const aplFadeLinear = reduceMotion.matches
        ? 1
        : Math.max(0, Math.min(1, (time - acousticSecondPageFadeMs) / acousticAplFadeMs));
      const aplEntranceOpacity = aplFadeLinear * aplFadeLinear * (3 - 2 * aplFadeLinear);
      const scanStarted = reduceMotion.matches || aplFadeLinear >= 1;
      const scanTime = reduceMotion.matches
        ? time
        : Math.max(0, time - acousticSecondPageFadeMs - acousticAplFadeMs);
      const scanLeft = width * .1;
      const scanRight = width * .9;
      const groundY = height * .34;
      const sceneBottom = height * .52;
      const mapTop = height * .56;
      const mapBottom = height * .97;
      const scanCount = 7;
      const scanPositions = Array.from(
        { length: scanCount },
        (_, index) => scanLeft + (scanRight - scanLeft) * index / (scanCount - 1)
      );

      context.fillStyle = `color-mix(in srgb, ${state.heading} 3%, transparent)`;
      context.fillRect(0, groundY, width, sceneBottom - groundY);
      context.strokeStyle = state.line;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, groundY + .5);
      context.lineTo(width, groundY + .5);
      context.stroke();

      scanPositions.forEach((position, index) => {
        context.strokeStyle = index === 0 ? state.accent : state.line;
        context.beginPath();
        context.moveTo(position, groundY - 4);
        context.lineTo(position, groundY + 5);
        context.stroke();
      });
      const pipeX = scanLeft + (scanRight - scanLeft) * .61;
      const pipeY = height * .46;
      const pipeRadius = Math.min(22, width * .035, Math.max(8, (sceneBottom - pipeY) * .82));
      const rigScaleLimit = Math.min(.62, width / 900);
      const rigScale = Math.min(rigScaleLimit, Math.max(.44, (groundY - 8) / 190));
      const scanContacts = scanPositions.map((position) => (
        pipeContactPoint(position - 13 * rigScale, groundY, pipeX, pipeY, pipeRadius)
      ));
      const scanTimings = scanPositions.map((position, index) => {
        const contact = scanContacts[index];
        return acousticWaveTiming(state, position - 13 * rigScale, groundY, contact.x, contact.y);
      });
      const echoArrivalTimes = scanTimings.map((timing) => (
        ((timing.count - 1) * timing.stagger + timing.travel * 2) * acousticReferencePhaseMs
      ));
      const tileFadeDurationMs = 320;
      const moveDurationMs = 600;
      const stepDurations = echoArrivalTimes.map((arrival, index) => (
        arrival + tileFadeDurationMs + (index < scanCount - 1 ? moveDurationMs : 0)
      ));
      const scanDurationMs = stepDurations.reduce((total, duration) => total + duration, 0);
      const exitStartMs = scanDurationMs;
      const scanFadeStartMs = exitStartMs + acousticAplExitMs + acousticScanCompleteHoldMs;
      const restartStartMs = scanFadeStartMs + acousticScanResultFadeMs;
      const loopDurationMs = restartStartMs + acousticAplFadeMs;
      const loopTime = reduceMotion.matches ? scanDurationMs : scanTime % loopDurationMs;
      const restarting = !reduceMotion.matches && loopTime >= restartStartMs;
      const scanComplete = reduceMotion.matches || (loopTime >= scanDurationMs && !restarting);
      const scanFadeLinear = reduceMotion.matches
        ? 0
        : Math.max(0, Math.min(1, (loopTime - scanFadeStartMs) / acousticScanResultFadeMs));
      const scanFadeProgress = scanFadeLinear * scanFadeLinear * (3 - 2 * scanFadeLinear);
      const scanResultOpacity = restarting ? 0 : 1 - scanFadeProgress;
      const cycleTime = scanComplete ? scanDurationMs : restarting ? 0 : loopTime;
      let cycleAplOpacity = 1;
      if (scanComplete && !reduceMotion.matches) {
        const exitLinear = Math.max(0, Math.min(1, (loopTime - exitStartMs) / acousticAplExitMs));
        const exitProgress = exitLinear * exitLinear * (3 - 2 * exitLinear);
        cycleAplOpacity = 1 - exitProgress;
      } else if (restarting) {
        const restartLinear = Math.max(0, Math.min(1, (loopTime - restartStartMs) / acousticAplFadeMs));
        cycleAplOpacity = restartLinear * restartLinear * (3 - 2 * restartLinear);
      }
      const aplOpacity = aplEntranceOpacity * cycleAplOpacity;
      const scanRunning = scanStarted && !scanComplete && !restarting;
      let activeIndex = scanCount - 1;
      let stepStartMs = scanDurationMs - stepDurations[scanCount - 1];
      if (!scanComplete) {
        let cursor = 0;
        for (let index = 0; index < scanCount; index += 1) {
          if (cycleTime < cursor + stepDurations[index]) {
            activeIndex = index;
            stepStartMs = cursor;
            break;
          }
          cursor += stepDurations[index];
        }
      }
      const stepTime = scanComplete ? stepDurations[activeIndex] : cycleTime - stepStartMs;
      const timing = scanTimings[activeIndex];
      const contact = scanContacts[activeIndex];
      const echoArrivalMs = echoArrivalTimes[activeIndex];
      const nextIndex = Math.min(scanCount - 1, activeIndex + 1);
      const moveStartMs = echoArrivalMs + tileFadeDurationMs;
      const linearMove = Math.max(0, Math.min(1, (stepTime - moveStartMs) / moveDurationMs));
      const moveProgress = linearMove * linearMove * (3 - 2 * linearMove);
      const aplX = scanPositions[activeIndex] + (scanPositions[nextIndex] - scanPositions[activeIndex]) * moveProgress;
      context.save();
      context.globalAlpha = aplOpacity;
      const rig = drawApl(state, aplX, groundY, rigScaleLimit);
      context.restore();

      context.save();
      context.globalAlpha = .18;
      drawPipe(state, pipeX, pipeY, pipeRadius);
      context.restore();
      const measurementProgress = Math.min(1, stepTime / acousticReferencePhaseMs);
      if (scanRunning && stepTime < moveStartMs) {
        drawPulseEchoTrain(state, rig.sensorX, groundY, contact.x, contact.y, measurementProgress, sceneBottom);
        drawPipe(state, pipeX, pipeY, pipeRadius);
        drawAccelerometerBreath(state, rig, measurementProgress, timing);
      }

      const tileFadeLinear = scanComplete
        ? 1
        : Math.max(0, Math.min(1, (stepTime - echoArrivalMs) / tileFadeDurationMs));
      const tileOpacity = tileFadeLinear * tileFadeLinear * (3 - 2 * tileFadeLinear);
      const completedTiles = scanComplete ? scanCount : activeIndex;
      const currentScanNumber = scanComplete ? scanCount : scanRunning ? activeIndex + 1 : 0;
      const scanLabelY = Math.max(state.bulletSize * .6, rig.top - state.bulletSize * .7);
      context.save();
      context.globalAlpha = aplOpacity;
      bulletLabel(state, `SCAN ${currentScanNumber} / ${scanCount}`, aplX, scanLabelY, "center");
      context.restore();

      const mapWidth = scanRight - scanLeft;
      const mapHeight = mapBottom - mapTop;
      const tileWidth = mapWidth / scanCount;
      renderEchoHeatmap(mapWidth / mapHeight, state.accent);
      const drawMapTiles = (firstTile, tileCount, opacity = 1) => {
        const visibleOpacity = opacity * scanResultOpacity;
        if (tileCount <= 0 || visibleOpacity <= 0) return;
        context.save();
        context.beginPath();
        context.rect(scanLeft + tileWidth * firstTile, mapTop, tileWidth * tileCount, mapHeight);
        context.clip();
        context.globalAlpha = visibleOpacity;
        context.imageSmoothingEnabled = true;
        context.drawImage(echoHeatmap, scanLeft, mapTop, mapWidth, mapHeight);
        context.restore();
      };
      drawMapTiles(0, completedTiles);
      if (!scanComplete) drawMapTiles(activeIndex, 1, tileOpacity);

      const drawTileFrame = (tileIndex, opacity = 1) => {
        const visibleOpacity = opacity * scanResultOpacity;
        if (visibleOpacity <= 0) return;
        const tileX = scanLeft + tileWidth * tileIndex;
        const fontSize = Math.max(8, Math.min(10, state.bulletSize * .68));
        const frameLeft = tileX + (tileIndex === 0 ? .5 : 0);
        const frameRight = tileX + tileWidth - (tileIndex === scanCount - 1 ? .5 : 0);
        context.save();
        context.globalAlpha = visibleOpacity;
        context.strokeStyle = state.bulletColor;
        context.lineWidth = 1;
        context.strokeRect(frameLeft, mapTop + .5, Math.max(0, frameRight - frameLeft), Math.max(0, mapHeight - 1));
        context.fillStyle = state.bulletColor;
        context.font = `${state.bulletWeight} ${fontSize}px ${state.bulletFamily}`;
        context.textAlign = "left";
        context.textBaseline = "top";
        context.fillText(`Scan ${tileIndex + 1}`, tileX + 5, mapTop + 5);
        context.restore();
      };
      for (let index = 0; index < completedTiles; index += 1) drawTileFrame(index);
      if (!scanComplete) drawTileFrame(activeIndex, tileOpacity);
    };

    const drawScan = (state, time) => {
      const { context, width, height } = state;
      context.clearRect(0, 0, width, height);
      const sliceCount = 4;
      const sliceStaggerMs = 240;
      const sliceFadeMs = 420;
      const slicesCompleteMs = (sliceCount - 1) * sliceStaggerMs + sliceFadeMs;
      const mapFadeStartMs = slicesCompleteMs + 2000;
      const mapFadeDurationMs = 720;
      const tubeStartMs = mapFadeStartMs + mapFadeDurationMs + 120;
      const tubeDurationMs = 760;
      const tubeEndMs = tubeStartMs + tubeDurationMs;
      const sequenceHoldMs = 1450;
      const sequenceFadeMs = 520;
      const fadeStartMs = tubeEndMs + sequenceHoldMs;
      const sequenceDurationMs = fadeStartMs + sequenceFadeMs;
      const sequenceTime = reduceMotion.matches ? tubeEndMs : time % sequenceDurationMs;
      const fadeLinear = Math.max(0, Math.min(1, (sequenceTime - fadeStartMs) / sequenceFadeMs));
      const sequenceOpacity = 1 - fadeLinear * fadeLinear * (3 - 2 * fadeLinear);
      const tubeLinear = reduceMotion.matches
        ? 1
        : Math.max(0, Math.min(1, (sequenceTime - tubeStartMs) / tubeDurationMs));
      const tubeOpacity = tubeLinear * tubeLinear * (3 - 2 * tubeLinear);
      const mapFadeLinear = reduceMotion.matches
        ? 1
        : Math.max(0, Math.min(1, (sequenceTime - mapFadeStartMs) / mapFadeDurationMs));
      const mapFadeProgress = mapFadeLinear * mapFadeLinear * (3 - 2 * mapFadeLinear);
      const mapOpacity = 1 - mapFadeProgress;
      const [red, green, blue] = rgbChannels(state.accent);
      const horizontalPadding = Math.max(12, Math.min(22, width * .04));
      const verticalPadding = Math.max(12, Math.min(20, height * .055));
      const availableWidth = Math.max(1, width - horizontalPadding * 2);
      const availableHeight = Math.max(1, height - verticalPadding * 2);
      const depthX = Math.min(42, width * .072, availableWidth / (sliceCount + 2));
      const depthY = Math.min(34, height * .082, availableHeight / (sliceCount + 2));
      const planeWidth = availableWidth - depthX * (sliceCount - 1);
      const planeHeight = availableHeight - depthY * (sliceCount - 1);
      const frontX = horizontalPadding;
      const frontY = height - verticalPadding - planeHeight;
      const slices = Array.from({ length: sliceCount }, (_, index) => {
        const distanceFromFront = index;
        const scale = 1 - .1 * index / (sliceCount - 1);
        const sliceWidth = planeWidth * scale;
        const sliceHeight = planeHeight * scale;
        const x = frontX + distanceFromFront * depthX;
        const y = frontY - distanceFromFront * depthY;
        return {
          index,
          x,
          y,
          width: sliceWidth,
          height: sliceHeight,
          centerX: x + sliceWidth * .61,
          centerY: y + sliceHeight * .24
        };
      });

      const sliceReveal = (index) => {
        if (reduceMotion.matches) return 1;
        const linear = Math.max(0, Math.min(1, (sequenceTime - index * sliceStaggerMs) / sliceFadeMs));
        return linear * linear * (3 - 2 * linear);
      };

      const drawEnergySlice = (slice) => {
        const reveal = sliceReveal(slice.index);
        if (reveal <= 0 || sequenceOpacity <= 0 || mapOpacity <= 0) return;
        const depthOpacity = 1 - slice.index / (sliceCount - 1) * .44;
        const baseAlpha = reveal * sequenceOpacity * mapOpacity * depthOpacity;
        renderEchoHeatmap(slice.width / slice.height, state.accent);
        context.save();
        context.globalAlpha = baseAlpha;
        context.fillStyle = `rgba(${red}, ${green}, ${blue}, .065)`;
        context.fillRect(slice.x, slice.y, slice.width, slice.height);
        context.imageSmoothingEnabled = true;
        context.drawImage(echoHeatmap, slice.x, slice.y, slice.width, slice.height);

        context.strokeStyle = state.bulletColor;
        context.lineWidth = 1;
        context.strokeRect(slice.x + .5, slice.y + .5, slice.width - 1, slice.height - 1);
        context.fillStyle = state.bulletColor;
        context.font = `${state.bulletWeight} ${Math.max(8, Math.min(10, state.bulletSize * .66))}px ${state.bulletFamily}`;
        context.textAlign = "left";
        context.textBaseline = "top";
        context.fillText(`Row ${slice.index + 1}`, slice.x + 6, slice.y + 6);
        context.restore();
      };

      const slicesBackToFront = [...slices].reverse();
      slicesBackToFront.forEach((slice) => {
        drawEnergySlice(slice);
        const reveal = sliceReveal(slice.index);
        if (reveal <= 0) return;
        const glowRadius = slice.width * .105;
        const glow = context.createRadialGradient(
          slice.centerX,
          slice.centerY,
          0,
          slice.centerX,
          slice.centerY,
          glowRadius
        );
        glow.addColorStop(0, `rgba(${red}, ${green}, ${blue}, .5)`);
        glow.addColorStop(.26, `rgba(${red}, ${green}, ${blue}, .4)`);
        glow.addColorStop(.62, `rgba(${red}, ${green}, ${blue}, .13)`);
        glow.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);
        context.save();
        context.globalAlpha = reveal * sequenceOpacity * (1 - mapOpacity) * (1 - tubeOpacity);
        context.fillStyle = glow;
        context.fillRect(
          slice.centerX - glowRadius,
          slice.centerY - glowRadius,
          glowRadius * 2,
          glowRadius * 2
        );
        context.restore();
      });

      const points = slices.map((slice) => ({ x: slice.centerX, y: slice.centerY }));
      if (tubeOpacity > 0 && sequenceOpacity > 0) {
        const front = points[0];
        const back = points[points.length - 1];
        const tubeX = back.x - front.x;
        const tubeY = back.y - front.y;
        const tubeLength = Math.max(1, Math.hypot(tubeX, tubeY));
        const normalX = -tubeY / tubeLength;
        const normalY = tubeX / tubeLength;
        const capAngle = Math.atan2(tubeY, tubeX) + Math.PI / 2;
        const frontRadius = Math.max(9, Math.min(15, planeHeight * .075));
        const backRadius = frontRadius * .62;
        context.save();
        context.globalAlpha = tubeOpacity * sequenceOpacity;
        context.shadowColor = state.accent;
        context.shadowBlur = 10 * tubeOpacity * sequenceOpacity;

        context.fillStyle = `color-mix(in srgb, ${state.accent} 58%, ${state.heading})`;
        context.beginPath();
        context.ellipse(back.x, back.y, backRadius, backRadius * .58, capAngle, 0, Math.PI * 2);
        context.fill();

        const bodyGradient = context.createLinearGradient(
          front.x + normalX * frontRadius,
          front.y + normalY * frontRadius,
          front.x - normalX * frontRadius,
          front.y - normalY * frontRadius
        );
        bodyGradient.addColorStop(0, `rgba(${red}, ${green}, ${blue}, .48)`);
        bodyGradient.addColorStop(.38, `rgba(${red}, ${green}, ${blue}, .96)`);
        bodyGradient.addColorStop(.72, `rgba(${red}, ${green}, ${blue}, .82)`);
        bodyGradient.addColorStop(1, `rgba(${red}, ${green}, ${blue}, .42)`);
        context.fillStyle = bodyGradient;
        context.strokeStyle = `color-mix(in srgb, ${state.accent} 62%, ${state.heading})`;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(front.x + normalX * frontRadius, front.y + normalY * frontRadius);
        context.lineTo(back.x + normalX * backRadius, back.y + normalY * backRadius);
        context.lineTo(back.x - normalX * backRadius, back.y - normalY * backRadius);
        context.lineTo(front.x - normalX * frontRadius, front.y - normalY * frontRadius);
        context.closePath();
        context.fill();
        context.stroke();

        context.shadowBlur = 0;
        context.strokeStyle = `color-mix(in srgb, ${state.accent} 42%, ${state.paper})`;
        context.lineWidth = 1.5;
        context.beginPath();
        context.moveTo(front.x + normalX * frontRadius * .36, front.y + normalY * frontRadius * .36);
        context.lineTo(back.x + normalX * backRadius * .36, back.y + normalY * backRadius * .36);
        context.stroke();

        context.shadowBlur = 0;
        context.fillStyle = `color-mix(in srgb, ${state.accent} 76%, ${state.heading})`;
        context.strokeStyle = state.bulletColor;
        context.lineWidth = 1;
        context.beginPath();
        context.ellipse(front.x, front.y, frontRadius, frontRadius * .62, capAngle, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.restore();
      }
    };

    const createScanThree = () => {
      if (!scanCanvas || !window.THREE) return null;
      const { THREE } = window;
      const sliceCount = 4;
      const planeWidth = 8.4;
      const planeHeight = 4.8;
      const planeAspect = planeWidth / planeHeight;
      const scanSpacing = 5;
      const scene = new THREE.Scene();
      const scanGroup = new THREE.Group();
      scene.add(scanGroup);
      const camera = new THREE.PerspectiveCamera(36, 1, .1, 100);
      camera.position.set(14, 0, -10);
      camera.lookAt(-scanSpacing * (sliceCount - 1) / 2, 0, 0);

      const renderer = new THREE.WebGLRenderer({ canvas: scanCanvas, alpha: true, antialias: true });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.sortObjects = true;
      const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

      scene.add(new THREE.HemisphereLight(0xffffff, 0x111111, 1.55));
      const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
      keyLight.position.set(-6, 8, 12);
      scene.add(keyLight);
      const rimLight = new THREE.DirectionalLight(0xffffff, .7);
      rimLight.position.set(7, -3, 8);
      scene.add(rimLight);

      const planeGeometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
      const outlineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-planeWidth / 2, -planeHeight / 2, .025),
        new THREE.Vector3(planeWidth / 2, -planeHeight / 2, .025),
        new THREE.Vector3(planeWidth / 2, planeHeight / 2, .025),
        new THREE.Vector3(-planeWidth / 2, planeHeight / 2, .025)
      ]);
      const rows = Array.from({ length: sliceCount }, (_, index) => {
        const rowGroup = new THREE.Group();
        rowGroup.position.set(-index * scanSpacing, 0, 0);
        rowGroup.rotation.y = Math.PI / 3;
        scanGroup.add(rowGroup);

        const textureCanvas = document.createElement("canvas");
        textureCanvas.width = 896;
        textureCanvas.height = 512;
        const textureContext = textureCanvas.getContext("2d");
        const texture = new THREE.CanvasTexture(textureCanvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        texture.anisotropy = maxAnisotropy;
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthTest: true,
          depthWrite: false
        });
        const mesh = new THREE.Mesh(planeGeometry, material);
        const baseOrder = (sliceCount - index) * 3;
        mesh.renderOrder = baseOrder;
        rowGroup.add(mesh);

        const outlineMaterial = new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          depthTest: true,
          depthWrite: false
        });
        const outline = new THREE.LineLoop(outlineGeometry, outlineMaterial);
        outline.renderOrder = baseOrder + 1;
        rowGroup.add(outline);

        const labelCanvas = document.createElement("canvas");
        labelCanvas.width = 512;
        labelCanvas.height = 128;
        const labelContext = labelCanvas.getContext("2d");
        const labelTexture = new THREE.CanvasTexture(labelCanvas);
        labelTexture.colorSpace = THREE.SRGBColorSpace;
        labelTexture.minFilter = THREE.LinearFilter;
        labelTexture.magFilter = THREE.LinearFilter;
        labelTexture.generateMipmaps = false;
        labelTexture.anisotropy = maxAnisotropy;
        const labelSide = index % 2 === 0 ? "left" : "right";
        const labelAnchor = new THREE.Vector3(
          labelSide === "left" ? -planeWidth / 2 : planeWidth / 2,
          planeHeight / 2,
          .025
        );
        const labelConnectorMaterial = new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          depthTest: false,
          depthWrite: false
        });
        const labelConnector = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
          labelConnectorMaterial
        );
        labelConnector.frustumCulled = false;
        labelConnector.renderOrder = 40 + index;
        scanGroup.add(labelConnector);
        const labelMaterial = new THREE.SpriteMaterial({
          map: labelTexture,
          transparent: true,
          opacity: 0,
          depthTest: false,
          depthWrite: false,
          sizeAttenuation: false
        });
        const label = new THREE.Sprite(labelMaterial);
        label.position.copy(rowGroup.localToWorld(labelAnchor.clone()));
        label.center.set(.5, .5);
        label.scale.set(.14, .035, 1);
        label.renderOrder = 50 + index;
        scanGroup.add(label);
        return {
          index,
          rowGroup,
          textureCanvas,
          textureContext,
          texture,
          material,
          mesh,
          outline,
          outlineMaterial,
          label,
          labelCanvas,
          labelContext,
          labelTexture,
          labelMaterial,
          labelSide,
          labelAnchor,
          labelConnector,
          labelConnectorMaterial
        };
      });

      const glowCanvas = document.createElement("canvas");
      glowCanvas.width = 256;
      glowCanvas.height = 256;
      const glowContext = glowCanvas.getContext("2d");
      const glowTexture = new THREE.CanvasTexture(glowCanvas);
      glowTexture.colorSpace = THREE.SRGBColorSpace;
      glowTexture.minFilter = THREE.LinearFilter;
      glowTexture.magFilter = THREE.LinearFilter;
      glowTexture.generateMipmaps = false;
      const glowGeometry = new THREE.PlaneGeometry(1.75, 1.75);
      const hotspotLocal = new THREE.Vector3((.61 - .5) * planeWidth, (.5 - .24) * planeHeight, .04);
      const glows = rows.map((row) => {
        const material = new THREE.MeshBasicMaterial({
          map: glowTexture,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthTest: true,
          depthWrite: false
        });
        const mesh = new THREE.Mesh(glowGeometry, material);
        mesh.position.copy(hotspotLocal);
        mesh.renderOrder = 20 + sliceCount - row.index;
        row.rowGroup.add(mesh);
        return { material, mesh };
      });

      scanGroup.updateMatrixWorld(true);
      const responsePoints = rows.map((row) => row.rowGroup.localToWorld(hotspotLocal.clone()));
      const pipeStart = responsePoints[0];
      const pipeEnd = responsePoints[responsePoints.length - 1];
      const pipeLength = scanSpacing * (sliceCount - 1);
      const pipeMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x000000,
        emissiveIntensity: .12,
        roughness: .42,
        metalness: .16,
        transparent: true,
        opacity: 0,
        depthTest: true,
        depthWrite: true
      });
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(.19, .19, pipeLength, 32, 1, false), pipeMaterial);
      pipe.position.copy(pipeStart).add(pipeEnd).multiplyScalar(.5);
      pipe.rotation.z = Math.PI / 2;
      pipe.renderOrder = 30;
      pipe.visible = false;
      scanGroup.add(pipe);

      let themeKey = "";
      const refreshTheme = () => {
        const style = getComputedStyle(document.body);
        const bullet = scanCanvas.closest("[data-acoustic-subpage]")?.querySelector(".thermal-points");
        const bulletStyle = bullet ? getComputedStyle(bullet) : style;
        const accent = style.getPropertyValue("--accent").trim() || "rgb(78, 218, 122)";
        const muted = style.getPropertyValue("--muted").trim() || bulletStyle.color;
        const bulletColor = bulletStyle.color;
        const bulletFamily = bulletStyle.fontFamily;
        const bulletWeight = bulletStyle.fontWeight || "400";
        const nextThemeKey = `${accent}|${muted}|${bulletColor}|${bulletFamily}|${bulletWeight}`;
        if (nextThemeKey === themeKey) return;
        themeKey = nextThemeKey;
        const [red, green, blue] = rgbChannels(accent);
        renderEchoHeatmap(planeAspect, accent);
        rows.forEach((row) => {
          const { textureCanvas, textureContext } = row;
          textureContext.clearRect(0, 0, textureCanvas.width, textureCanvas.height);
          textureContext.fillStyle = `rgba(${red}, ${green}, ${blue}, .065)`;
          textureContext.fillRect(0, 0, textureCanvas.width, textureCanvas.height);
          textureContext.imageSmoothingEnabled = true;
          textureContext.drawImage(echoHeatmap, 0, 0, textureCanvas.width, textureCanvas.height);
          row.texture.needsUpdate = true;
          row.outlineMaterial.color.set(bulletColor);
          row.labelConnectorMaterial.color.set(muted);

          const { labelCanvas, labelContext } = row;
          labelContext.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
          labelContext.beginPath();
          labelContext.roundRect(7, 7, labelCanvas.width - 14, labelCanvas.height - 14, 18);
          labelContext.save();
          labelContext.fillStyle = accent;
          labelContext.globalAlpha = .12;
          labelContext.fill();
          labelContext.restore();
          labelContext.save();
          labelContext.strokeStyle = accent;
          labelContext.globalAlpha = .7;
          labelContext.lineWidth = 4;
          labelContext.stroke();
          labelContext.restore();
          labelContext.fillStyle = muted;
          labelContext.font = '500 50px "IBM Plex Mono", monospace';
          labelContext.textAlign = "center";
          labelContext.textBaseline = "middle";
          labelContext.fillText(`ROW ${row.index + 1}`, labelCanvas.width / 2, labelCanvas.height / 2 + 1);
          row.labelTexture.needsUpdate = true;
        });

        glowContext.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
        const glow = glowContext.createRadialGradient(128, 128, 0, 128, 128, 128);
        glow.addColorStop(0, `rgba(${red}, ${green}, ${blue}, .5)`);
        glow.addColorStop(.26, `rgba(${red}, ${green}, ${blue}, .4)`);
        glow.addColorStop(.62, `rgba(${red}, ${green}, ${blue}, .13)`);
        glow.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);
        glowContext.fillStyle = glow;
        glowContext.fillRect(0, 0, glowCanvas.width, glowCanvas.height);
        glowTexture.needsUpdate = true;
        pipeMaterial.color.set(accent);
        pipeMaterial.emissive.set(accent);
      };

      const smooth = (value) => {
        const clamped = Math.max(0, Math.min(1, value));
        return clamped * clamped * (3 - 2 * clamped);
      };
      const layoutLabels = (rect) => {
        scene.updateMatrixWorld(true);
        camera.updateMatrixWorld(true);
        const projectedAnchors = rows.map((row) => {
          const world = row.rowGroup.localToWorld(row.labelAnchor.clone());
          return { world, ndc: world.clone().project(camera) };
        });
        const tagWidthNdc = rows[0].label.scale.x * camera.projectionMatrix.elements[0];
        const tagHeightNdc = rows[0].label.scale.y * camera.projectionMatrix.elements[5];
        const gapX = 10 * 2 / Math.max(1, rect.width);
        const gapY = Math.max(6 * 2 / Math.max(1, rect.height), tagHeightNdc * .14);
        const halfWidth = tagWidthNdc / 2;
        const halfHeight = tagHeightNdc / 2;
        rows.forEach((row) => {
          const anchor = projectedAnchors[row.index];
          const direction = row.labelSide === "left" ? -1 : 1;
          const labelX = anchor.ndc.x + direction * (gapX + halfWidth);
          const rowThreeLift = row.index === 2 ? 104 * 2 / Math.max(1, rect.height) : 0;
          const labelY = anchor.ndc.y + gapY + halfHeight + rowThreeLift;
          const labelNdc = new THREE.Vector3(labelX, labelY, anchor.ndc.z);
          const tagPortNdc = new THREE.Vector3(
            labelX - direction * halfWidth * .96,
            labelY,
            anchor.ndc.z
          );
          const tagPortWorld = tagPortNdc.unproject(camera);
          row.label.position.copy(labelNdc.unproject(camera));
          const positions = row.labelConnector.geometry.attributes.position;
          positions.setXYZ(0, anchor.world.x, anchor.world.y, anchor.world.z);
          positions.setXYZ(1, tagPortWorld.x, tagPortWorld.y, tagPortWorld.z);
          positions.needsUpdate = true;
        });
      };
      let labelLayoutWidth = 0;
      let labelLayoutHeight = 0;
      const resize = () => {
        const rect = scanCanvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const targetWidth = Math.round(rect.width * ratio);
        const targetHeight = Math.round(rect.height * ratio);
        if (scanCanvas.width !== targetWidth || scanCanvas.height !== targetHeight) {
          renderer.setSize(rect.width, rect.height, false);
        }
        if (rect.width !== labelLayoutWidth || rect.height !== labelLayoutHeight) {
          camera.aspect = rect.width / rect.height;
          camera.updateProjectionMatrix();
          layoutLabels(rect);
          labelLayoutWidth = rect.width;
          labelLayoutHeight = rect.height;
        }
        return true;
      };
      const isActive = () => Boolean(
        !document.hidden
        && scanCanvas.closest(".research-subpage")?.classList.contains("is-active")
        && scanCanvas.closest(".page-section")?.classList.contains("active")
        && scanCanvas.closest(".content-view")?.classList.contains("active")
      );

      const render = (now) => {
        if (!isActive() || !resize()) return;
        refreshTheme();
        const sliceStaggerMs = 240;
        const sliceFadeMs = 420;
        const slicesCompleteMs = (sliceCount - 1) * sliceStaggerMs + sliceFadeMs;
        const mapFadeStartMs = slicesCompleteMs + 2000;
        const mapFadeDurationMs = 720;
        const tubeStartMs = mapFadeStartMs + mapFadeDurationMs + 120;
        const tubeDurationMs = 760;
        const tubeEndMs = tubeStartMs + tubeDurationMs;
        const fadeStartMs = tubeEndMs + 1450;
        const sequenceFadeMs = 520;
        const sequenceDurationMs = fadeStartMs + sequenceFadeMs;
        const elapsed = now - (starts.get(scanCanvas) || now);
        const sequenceTime = reduceMotion.matches ? tubeEndMs : elapsed % sequenceDurationMs;
        const sequenceOpacity = 1 - smooth((sequenceTime - fadeStartMs) / sequenceFadeMs);
        const mapOpacity = 1 - smooth((sequenceTime - mapFadeStartMs) / mapFadeDurationMs);
        const tubeOpacity = smooth((sequenceTime - tubeStartMs) / tubeDurationMs);

        rows.forEach((row) => {
          const reveal = reduceMotion.matches ? 1 : smooth((sequenceTime - row.index * sliceStaggerMs) / sliceFadeMs);
          const depthOpacity = 1 - row.index / (sliceCount - 1) * .44;
          row.material.opacity = reveal * mapOpacity * sequenceOpacity * depthOpacity;
          row.mesh.visible = row.material.opacity > .001;
          row.outlineMaterial.opacity = row.material.opacity;
          row.outline.visible = row.mesh.visible;
          row.labelMaterial.opacity = row.material.opacity;
          row.label.visible = row.mesh.visible;
          row.labelConnectorMaterial.opacity = row.labelMaterial.opacity * .7;
          row.labelConnector.visible = row.label.visible;
          glows[row.index].material.opacity = reveal * (1 - mapOpacity) * (1 - tubeOpacity) * sequenceOpacity;
          glows[row.index].mesh.visible = glows[row.index].material.opacity > .001;
        });
        pipeMaterial.opacity = tubeOpacity * sequenceOpacity;
        pipe.visible = pipeMaterial.opacity > .001;
        renderer.render(scene, camera);
      };

      refreshTheme();
      return { render, refreshTheme };
    };

    const scanThree = createScanThree();

    const draw = (now) => {
      canvases.forEach((canvas) => {
        const subpageActive = canvas.closest(".research-subpage")?.classList.contains("is-active");
        const sectionActive = canvas.closest(".page-section")?.classList.contains("active");
        const viewActive = canvas.closest(".content-view")?.classList.contains("active");
        const canvasActive = subpageActive && sectionActive && viewActive;
        if (canvas.dataset.acousticCanvas === "echo" && !canvasActive) {
          if (echoRunning.get(canvas)) {
            const state = setup(canvas);
            state?.context.clearRect(0, 0, state.width, state.height);
            starts.set(canvas, now);
          }
          echoRunning.set(canvas, false);
          return;
        }
        if (window.innerWidth > 850 && !canvasActive) return;
        const state = setup(canvas);
        if (!state) return;
        if (canvas.dataset.acousticCanvas === "echo" && !echoRunning.get(canvas)) {
          starts.set(canvas, now);
          echoRunning.set(canvas, true);
        }
        const elapsed = now - (starts.get(canvas) || now);
        if (canvas.dataset.acousticCanvas === "apl") drawAplIntro(state, elapsed);
        if (canvas.dataset.acousticCanvas === "echo") drawEcho(state, elapsed);
      });
      scanThree?.render(now);
      window.requestAnimationFrame(draw);
    };

    document.addEventListener("acousticpageentered", (event) => {
      const canvas = event.detail?.incoming?.querySelector("[data-acoustic-canvas]");
      if (!canvas) return;
      starts.set(
        canvas,
        canvas.dataset.acousticCanvas === "apl" ? Number.POSITIVE_INFINITY : performance.now()
      );
    });
    document.addEventListener("acousticpagecontentready", (event) => {
      const canvas = event.detail?.incoming?.querySelector('[data-acoustic-canvas="apl"]');
      if (canvas) starts.set(canvas, performance.now() + acousticAplIntroHoldMs);
    });
    document.addEventListener("sectionthemechange", () => {
      canvases.forEach((canvas) => setup(canvas));
      scanThree?.refreshTheme();
    });
    if (canvases[0]) {
      new ResizeObserver((entries) => entries.forEach((entry) => setup(entry.target))).observe(canvases[0]);
      canvases.slice(1).forEach((canvas) => new ResizeObserver(() => setup(canvas)).observe(canvas));
    }
    window.requestAnimationFrame(draw);
  };

  const initAcousticPager = () => {
    const pager = document.querySelector("[data-acoustic-subpager]");
    if (!pager) return;
    const pages = [...pager.querySelectorAll("[data-acoustic-subpage]")];
    const buttons = [...document.querySelectorAll("[data-acoustic-page-target]")];
    let activePage = 0;
    let switchingPage = false;
    let wheelLocked = false;
    let wheelResetTimer = 0;
    let wheelDelta = 0;
    const pageScrollTop = (page) => Math.max(0, page.offsetTop - pages[0].offsetTop);
    const nextPaint = () => new Promise((resolve) => window.requestAnimationFrame(resolve));
    const pageItems = (page) => [...page.querySelectorAll(":scope > .research-subpage-copy > .page-kicker, :scope > .research-subpage-copy > .thermal-points > li, :scope > .research-visual")];
    const fadeSecondPageVisualIn = (visual) => {
      if (!visual) return Promise.resolve();
      visual.style.opacity = "0";
      if (reduceMotion) {
        visual.style.opacity = "1";
        return Promise.resolve();
      }
      const duration = acousticSecondPageFadeMs;
      visual.style.transition = `opacity ${duration}ms ease`;
      return new Promise((resolve) => {
        window.requestAnimationFrame(() => {
          visual.style.opacity = "1";
          window.setTimeout(() => {
            visual.style.removeProperty("transition");
            resolve();
          }, duration);
        });
      });
    };
    const setActivePage = (index) => {
      activePage = Math.max(0, Math.min(index, pages.length - 1));
      pages.forEach((page, pageIndex) => page.classList.toggle("is-active", pageIndex === activePage));
      buttons.forEach((button, buttonIndex) => {
        const active = buttonIndex === activePage;
        button.classList.toggle("active", active);
        if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
      });
    };
    const changePage = async (index) => {
      const target = Math.max(0, Math.min(index, pages.length - 1));
      if (target === activePage || switchingPage) return;
      switchingPage = true;
      const outgoing = pages[activePage];
      const incoming = pages[target];
      const incomingItems = pageItems(incoming);
      const enteringVisual = target === 1 ? incoming.querySelector(":scope > .research-visual") : null;
      const standardIncomingItems = enteringVisual
        ? incomingItems.filter((item) => item !== enteringVisual)
        : incomingItems;
      await fadeList(pageItems(outgoing), false);
      setOpacity(incomingItems, 0);
      void incoming.offsetWidth;
      pager.scrollTop = pageScrollTop(incoming);
      setActivePage(target);
      await nextPaint();
      pager.scrollTop = pageScrollTop(incoming);
      document.dispatchEvent(new CustomEvent("acousticpageentered", { detail: { outgoing, incoming, index: target } }));
      await Promise.all([
        fadeList(standardIncomingItems, true),
        fadeSecondPageVisualIn(enteringVisual)
      ]);
      document.dispatchEvent(new CustomEvent("acousticpagecontentready", {
        detail: { outgoing, incoming, index: target }
      }));
      switchingPage = false;
    };
    pager.addEventListener("wheel", (event) => {
      if (!event.deltaY) return;
      event.preventDefault();
      window.clearTimeout(wheelResetTimer);
      wheelResetTimer = window.setTimeout(() => { wheelLocked = false; wheelDelta = 0; }, 220);
      if (wheelLocked || switchingPage) return;
      wheelDelta += event.deltaY;
      if (Math.abs(wheelDelta) < 18) return;
      wheelLocked = true;
      changePage(activePage + (wheelDelta > 0 ? 1 : -1));
    }, { passive: false });
    buttons.forEach((button) => button.addEventListener("click", () => changePage(Number(button.dataset.acousticPageTarget))));
    document.addEventListener("acousticpagerreset", () => {
      window.clearTimeout(wheelResetTimer);
      wheelLocked = false;
      wheelDelta = 0;
      switchingPage = false;
      pager.scrollTo({ top: 0, behavior: "auto" });
      setActivePage(0);
      pages.flatMap(pageItems).forEach((item) => item.style.removeProperty("opacity"));
      document.dispatchEvent(new CustomEvent("acousticpageentered", { detail: { incoming: pages[0], index: 0 } }));
    });
    const notifyFirstPageReady = (container) => {
      const section = pager.closest(".page-section");
      if (!container || !section?.classList.contains("active") || !pages[0].classList.contains("is-active")) return;
      if (container !== section && !container.contains?.(section)) return;
      document.dispatchEvent(new CustomEvent("acousticpagecontentready", {
        detail: { incoming: pages[0], index: 0 }
      }));
    };
    document.addEventListener("sectionentered", (event) => notifyFirstPageReady(event.detail?.incoming));
    document.addEventListener("viewentered", (event) => notifyFirstPageReady(event.detail?.incoming));
    setActivePage(0);
  };

  const initModelMakingViewer = () => {
    const viewer = document.querySelector("[data-model-making-viewer]");
    const canvas = viewer?.querySelector("[data-model-making-canvas]");
    const stage = viewer?.querySelector(".model-making-stage");
    const status = viewer?.querySelector("[data-model-making-status]");
    const explodeInput = viewer?.querySelector("[data-model-explode]");
    const explodeOutput = viewer?.querySelector("[data-model-explode-output]");
    const section = viewer?.closest("#lab-model-making");
    const kicker = section?.querySelector("[data-model-making-kicker]") || document.querySelector("[data-model-making-kicker]");
    const modelButtons = [...(section?.querySelectorAll("[data-model-key]") || [])];
    if (!viewer || !canvas || !stage || !status || !explodeInput || !modelButtons.length || !window.THREE) return;

    const labView = viewer.closest("[data-view='lab']");
    if (!labView?.classList.contains("active") || !section?.classList.contains("active")) {
      const initializeWhenVisible = (event) => {
        const incoming = event.detail?.incoming;
        if (incoming !== section || !labView.classList.contains("active") || !section.classList.contains("active")) return;
        document.removeEventListener("sectionentered", initializeWhenVisible);
        initModelMakingViewer();
      };
      document.addEventListener("sectionentered", initializeWhenVisible);
      return;
    }

    const { THREE } = window;
    const modelDefinitions = {
      akm: {
        key: "akm",
        label: "AKM",
        url: "assets/Models/Guns/AKM_Assembly_Web.glb?v=20260828-003",
        rootName: "AKM Assembly",
        componentCount: 34,
        anchors: ["ak-47 receiver assembly", "ak-47 receiver-1"]
      },
      ar15: {
        key: "ar15",
        label: "AR-15",
        url: "assets/Models/Guns/AR-15_Assembly_Web.glb?v=20260828-004",
        rootName: "AR-15 Assembly",
        componentCount: 36,
        anchors: ["ar-15 lower receiver assembly", "ar15 lower receiver-1", "pmag 30 gen m3 ar-15 body-1"]
      },
      m24: {
        key: "m24",
        label: "M24",
        url: "assets/Models/Guns/M24_Assembly_Web.glb?v=20260828-003",
        rootName: "M24 Assembly",
        componentCount: 21,
        anchors: ["m24 sws stock-1"]
      }
    };
    const isVisible = () => Boolean(
      !document.hidden
      && labView?.classList.contains("active")
      && section?.classList.contains("active")
    );

    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.8;

    const camera = new THREE.PerspectiveCamera(30, 1, .001, 100);
    camera.up.set(0, 0, 1);
    const stageRoot = new THREE.Group();
    const tiltRoot = new THREE.Group();
    const turntableRoot = new THREE.Group();
    const modelOffsetRoot = new THREE.Group();
    const orientationRoot = new THREE.Group();
    orientationRoot.rotation.x = Math.PI / 2;
    scene.add(stageRoot);
    stageRoot.add(tiltRoot);
    tiltRoot.add(turntableRoot);
    turntableRoot.add(modelOffsetRoot);
    modelOffsetRoot.add(orientationRoot);

    scene.add(new THREE.HemisphereLight(0xf4f7f5, 0x26302c, 2.5));
    const keyLight = new THREE.DirectionalLight(0xffffff, 4.2);
    keyLight.position.set(-4, -6, 7);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x8fcde8, 2.2);
    rimLight.position.set(5, 4, 3);
    scene.add(rimLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 3.4);
    fillLight.position.set(4, -5, 1.5);
    scene.add(fillLight);

    const componentTypes = {
      5120: Int8Array,
      5121: Uint8Array,
      5122: Int16Array,
      5123: Uint16Array,
      5125: Uint32Array,
      5126: Float32Array
    };
    const componentBytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
    const accessorSizes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

    const appleWebKitGlb = /AppleWebKit/i.test(navigator.userAgent)
      && !/(Chrome|Chromium|CriOS|Edg|EdgiOS|OPR|FxiOS)/i.test(navigator.userAgent);
    const requestGlbData = (url, { signal } = {}) => {
      if (!appleWebKitGlb) {
        return fetch(url, { signal, cache: "force-cache" }).then((response) => {
          if (!response.ok) throw new Error(`Model request failed (${response.status})`);
          return response.arrayBuffer();
        });
      }

      return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        let settled = false;
        const cleanup = () => signal?.removeEventListener("abort", abortRequest);
        const finish = (callback, value) => {
          if (settled) return;
          settled = true;
          cleanup();
          callback(value);
        };
        const abortRequest = () => {
          request.abort();
          finish(reject, new DOMException("The operation was aborted.", "AbortError"));
        };
        if (signal?.aborted) {
          abortRequest();
          return;
        }
        signal?.addEventListener("abort", abortRequest, { once: true });
        request.open("GET", url, true);
        request.responseType = "arraybuffer";
        request.onload = () => {
          if ((request.status >= 200 && request.status < 300) || (request.status === 0 && request.response)) {
            finish(resolve, request.response);
          } else {
            finish(reject, new Error(`Model request failed (${request.status})`));
          }
        };
        request.onerror = () => finish(reject, new Error("Model request failed (network error)"));
        request.onabort = () => finish(reject, new DOMException("The operation was aborted.", "AbortError"));
        request.send();
      });
    };

    const readGlb = async (url, { signal } = {}) => {
      const data = await requestGlbData(url, { signal });
      const view = new DataView(data);
      if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) {
        throw new Error("Unsupported GLB file");
      }

      let offset = 12;
      let gltf;
      let binaryOffset = 0;
      while (offset < data.byteLength) {
        const length = view.getUint32(offset, true);
        const type = view.getUint32(offset + 4, true);
        const start = offset + 8;
        if (type === 0x4e4f534a) {
          gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(data, start, length)).trimEnd());
        } else if (type === 0x004e4942) {
          binaryOffset = start;
        }
        offset = start + length;
      }
      if (!gltf || !binaryOffset) throw new Error("Incomplete GLB file");

      const readAccessor = (index) => {
        const accessor = gltf.accessors[index];
        const bufferView = gltf.bufferViews[accessor.bufferView];
        const ArrayType = componentTypes[accessor.componentType];
        const itemSize = accessorSizes[accessor.type];
        const bytes = componentBytes[accessor.componentType];
        const byteOffset = binaryOffset + (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
        const packedStride = itemSize * bytes;
        const byteStride = bufferView.byteStride || packedStride;

        if (byteStride === packedStride) {
          return {
            array: new ArrayType(data, byteOffset, accessor.count * itemSize),
            itemSize,
            normalized: Boolean(accessor.normalized)
          };
        }

        const array = new ArrayType(accessor.count * itemSize);
        const dataView = new DataView(data);
        const getters = {
          5120: "getInt8", 5121: "getUint8", 5122: "getInt16",
          5123: "getUint16", 5125: "getUint32", 5126: "getFloat32"
        };
        const getter = getters[accessor.componentType];
        for (let row = 0; row < accessor.count; row += 1) {
          for (let column = 0; column < itemSize; column += 1) {
            array[row * itemSize + column] = dataView[getter](byteOffset + row * byteStride + column * bytes, true);
          }
        }
        return { array, itemSize, normalized: Boolean(accessor.normalized) };
      };

      const materials = (gltf.materials || []).map((source) => {
        const pbr = source.pbrMetallicRoughness || {};
        const factor = pbr.baseColorFactor || [1, 1, 1, 1];
        const material = new THREE.MeshStandardMaterial({
          name: source.name || "Material",
          metalness: pbr.metallicFactor ?? 1,
          roughness: pbr.roughnessFactor ?? 1,
          opacity: factor[3] ?? 1,
          transparent: source.alphaMode === "BLEND" || (factor[3] ?? 1) < 1,
          side: source.doubleSided ? THREE.DoubleSide : THREE.FrontSide
        });
        material.color.setRGB(factor[0], factor[1], factor[2]);
        return material;
      });
      const fallbackMaterial = new THREE.MeshStandardMaterial({ color: 0x68706c, roughness: .5, metalness: .35 });

      const meshObjects = (gltf.meshes || []).map((meshDefinition) => {
        const primitives = (meshDefinition.primitives || []).map((primitive) => {
          const geometry = new THREE.BufferGeometry();
          const attributes = {
            POSITION: "position", NORMAL: "normal", TANGENT: "tangent",
            TEXCOORD_0: "uv", TEXCOORD_1: "uv1", COLOR_0: "color"
          };
          Object.entries(primitive.attributes || {}).forEach(([semantic, accessorIndex]) => {
            const attributeName = attributes[semantic];
            if (!attributeName) return;
            const attribute = readAccessor(accessorIndex);
            geometry.setAttribute(attributeName, new THREE.BufferAttribute(attribute.array, attribute.itemSize, attribute.normalized));
          });
          if (primitive.indices !== undefined) {
            const indices = readAccessor(primitive.indices);
            geometry.setIndex(new THREE.BufferAttribute(indices.array, 1, indices.normalized));
          }
          if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
          geometry.computeBoundingSphere();
          const material = materials[primitive.material] || fallbackMaterial;
          return new THREE.Mesh(geometry, material);
        });
        if (primitives.length === 1) return primitives[0];
        const group = new THREE.Group();
        primitives.forEach((primitive) => group.add(primitive));
        return group;
      });

      const nodes = (gltf.nodes || []).map((nodeDefinition) => {
        const object = nodeDefinition.mesh !== undefined
          ? meshObjects[nodeDefinition.mesh].clone()
          : new THREE.Group();
        object.name = nodeDefinition.name || "Node";
        if (nodeDefinition.matrix) {
          object.matrix.fromArray(nodeDefinition.matrix);
          object.matrix.decompose(object.position, object.quaternion, object.scale);
        } else {
          if (nodeDefinition.translation) object.position.fromArray(nodeDefinition.translation);
          if (nodeDefinition.rotation) object.quaternion.fromArray(nodeDefinition.rotation);
          if (nodeDefinition.scale) object.scale.fromArray(nodeDefinition.scale);
        }
        return object;
      });
      (gltf.nodes || []).forEach((nodeDefinition, index) => {
        (nodeDefinition.children || []).forEach((childIndex) => nodes[index].add(nodes[childIndex]));
      });

      const modelScene = new THREE.Group();
      const sceneDefinition = gltf.scenes?.[gltf.scene || 0];
      (sceneDefinition?.nodes || []).forEach((nodeIndex) => {
        const nodeDefinition = gltf.nodes[nodeIndex];
        if (nodeDefinition.camera !== undefined && nodeDefinition.mesh === undefined && !nodeDefinition.children?.length) return;
        modelScene.add(nodes[nodeIndex]);
      });
      return modelScene;
    };

    let model;
    let assembly;
    let explosionParts = [];
    let modelExtent = 1;
    let modelHeight = 1;
    let yaw = -.1;
    let pitch = .03;
    let explosionScale = 1;
    let drag = null;
    let ready = false;
    let lastFrame = performance.now();
    let currentDefinition = modelDefinitions.akm;
    let loadingController = null;
    let loadGeneration = 0;
    const modelFadeDuration = 240;

    const semanticExplosion = (name) => {
      const part = name.toLowerCase();
      const vector = (x, y, z, distance = 1) => ({ direction: new THREE.Vector3(x, y, z), distance });

      if (currentDefinition.key === "ar15") {
        if (part === "ar-15 lower receiver assembly") return null;
        if (part === "ar-15 upper receiver assembly") return vector(-.05, 1, 0, .82);
        if (part.includes("pmag 30") && part.includes("assembly")) return vector(0, -1, .08, 1.04);
        if (part.includes("pmag") && part.includes("body-1")) return null;
        if (part.includes("pmag") && part.includes("floor plate")) return vector(0, -1, 0, .62);
        if (part.includes("pmag") && part.includes("follower")) return vector(0, .75, 0, .62);
        if (part.includes("5.56x45")) return vector(0, .5, part.endsWith("-1") ? 1 : -1, .68);
        if (part.includes("12.5 barrel") || part.includes("suppressor")) return vector(-1, .04, 0, part.includes("suppressor") ? 1.42 : 1.02);
        if (part.includes("standard handguard")) return vector(-.28, .78, 0, .82);
        if (part.includes("angle grip") || part.includes("pistol grip")) return vector(.05, -1, 0, .88);
        if (part.includes("bolt carrier")) return vector(-.3, 1, 0, .92);
        if (part.includes("charging handle")) return vector(.45, 1, 0, .86);
        if (part.includes("forward assist")) return vector(.1, .25, -1, .72);
        if (part.includes("dust cover")) return vector(0, .25, 1, .72);
        if (part.includes("trigger system") && !part.includes("/")) return vector(.08, -.75, 0, .68);
        if (part.includes("mag release") || part.includes("mag locker") || part.includes("lrbho")) return vector(0, -.3, part.includes("pin") ? 1 : -1, .68);
        if (part.includes("vortex") || part.includes("geissele")) {
          if (part.includes("knob") || part.includes("turret") || part.includes("cap")) return vector(0, .2, /(?:-1|turret-1)$/.test(part) ? 1 : -1, .66);
          if (part.includes("body")) return vector(.2, .48, 0, .62);
          return vector(.04, 1, 0, .84);
        }
      }

      if (currentDefinition.key === "m24") {
        if (part === "m24 sws stock-1") return null;
        if (part === "m24 receiver assembly") return vector(.02, .72, 0, .78);
        if (part.includes("26 countour") && part.includes("barrel")) return vector(-1, .05, 0, 1.2);
        if (part.includes("trigger") || part.includes("magazine floorplate")) return vector(0, -1, 0, .82);
        if (part.includes("buttpad") || part.includes("fixed ring")) return vector(1, part.includes("wheel") ? .25 : 0, part.includes("wheel") ? 1 : 0, .88);
        if (part.includes("bolt handle")) return vector(.18, .28, -1, .78);
        if (part.includes("firing pin cover")) return vector(.8, .25, 0, .72);
        if (part.includes("vortex") || part.includes("seekings")) {
          if (part.includes("knob") || part.includes("turret") || part.includes("cap")) return vector(0, .2, /(?:-1|turret-1)$/.test(part) ? 1 : -1, .66);
          if (part.includes("body")) return vector(.2, .45, 0, .6);
          return vector(.02, 1, 0, .82);
        }
      }

      if (part.includes("slant brake")) return vector(-1, .04, 0, 1.45);
      if (part.includes("standard barrel")) return vector(-1, .03, 0, 1.08);
      if (part.includes("front sight")) return vector(-1, .16, 0, .78);
      if (part.includes("upper handguard")) return vector(-.18, 1, 0, .82);
      if (part.includes("lower handguard")) return vector(-.2, -.7, 0, .82);
      if (part.includes("vertical grip")) return vector(-.12, -1, 0, .92);
      if (part.includes("30 round")) return vector(0, -1, .08, 1.08);
      if (part.includes("pistol grip")) return vector(.16, -1, -.08, .92);
      if (part.includes("dust cover")) return vector(0, 1, 0, .92);
      if (part.includes("to ar adapter")) return vector(1, -.12, 0, .68);

      if (part.includes("receiver assembly")) return null;
      if (part.includes("bolt carrier")) return vector(-.3, 1, 0, 1.08);
      if (part.includes("recoil spring guide")) return vector(.72, 1, 0, 1.08);
      if (part.includes("trigger")) return vector(.05, -1, 0, .82);
      if (part.includes("fire selector")) return vector(.05, .25, -1, .82);
      if (part.includes("mag catch pin")) return vector(-.08, -.35, 1, .72);
      if (part.includes("mag lug")) return vector(-.2, -.85, -.2, .72);
      if (part.includes("rear sight block assembly") && !part.includes("/")) return vector(-.25, 1, 0, .72);
      if (part.includes("rear sight adjustor")) return vector(0, .32, 1, .72);
      if (part.includes("gas tube latch")) return vector(-.28, .08, -1, .72);
      if (part.includes("rear sight-1")) return vector(.05, 1, 0, .72);
      if (part.includes("rear sight block-1")) return vector(-.2, -.45, 0, .62);

      if (part === "magpul moe carbine assembly") return vector(1, .08, 0, 1);
      if (part.includes("magpul moe carbine-1")) return vector(1, .25, 0, .92);
      if (part === "carbine-1") return vector(-1, .05, 0, .82);
      if (part === "adjuster-1") return vector(.05, -1, .45, .72);
      if (part === "limiter-1") return vector(-.2, .05, 1, .66);
      if (part === "pin-1") return vector(.1, -.15, -1, .66);

      if (part.includes("acog") && part.includes("assembly")) return vector(.06, 1, 0, .92);
      if (part.includes("acog") && part.includes("mount")) return vector(0, -1, 0, .76);
      if (part.includes("acog") && part.includes("body")) return vector(-.18, .55, 0, .64);
      if (part.includes("acog") && part.includes("eyepiece")) return vector(1, .25, 0, .76);
      if (part.includes("acog") && part.includes("knob-1")) return vector(0, .2, 1, .68);
      if (part.includes("acog") && part.includes("knob-2")) return vector(0, .2, -1, .68);

      if (part.includes("picatinny screw-1")) return vector(-.15, .5, 1, .7);
      if (part.includes("picatinny screw-2")) return vector(0, .72, 0, .78);
      if (part.includes("picatinny screw-3")) return vector(.15, .5, -1, .7);
      return null;
    };

    const smoothstep = (start, end, value) => {
      const amount = Math.max(0, Math.min(1, (value - start) / (end - start)));
      return amount * amount * (3 - 2 * amount);
    };

    const worldDirectionToLocal = (object, direction) => {
      const parent = object.parent;
      if (!parent || !assembly) return direction.clone().normalize();
      const originWorld = assembly.localToWorld(new THREE.Vector3());
      const targetWorld = assembly.localToWorld(direction.clone().normalize());
      const originLocal = parent.worldToLocal(originWorld.clone());
      const targetLocal = parent.worldToLocal(targetWorld.clone());
      return targetLocal.sub(originLocal).normalize();
    };

    const spatialExplosion = (object, siblings, index) => {
      const parentBounds = new THREE.Box3();
      siblings.forEach((sibling) => parentBounds.expandByObject(sibling));
      const objectCenter = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
      const parentCenter = parentBounds.getCenter(new THREE.Vector3());
      const directionWorld = objectCenter.sub(parentCenter);
      const assemblyRotation = assembly.getWorldQuaternion(new THREE.Quaternion()).invert();
      directionWorld.applyQuaternion(assemblyRotation);
      directionWorld.multiply(new THREE.Vector3(1, 1.8, 3.4));

      const fan = siblings.length > 1 ? (index / (siblings.length - 1)) - .5 : 0;
      directionWorld.add(new THREE.Vector3(fan * .28, Math.cos(index * 2.4) * .18, Math.sin(index * 2.4) * .42));
      if (directionWorld.lengthSq() < .000001) directionWorld.set(fan || .2, .4, index % 2 ? 1 : -1);
      return directionWorld.normalize();
    };

    const buildExplosionParts = () => {
      const parts = [];
      const visit = (parent, depth) => {
        const children = parent.children.filter((child) => child.visible);
        children.forEach((object, index) => {
          const semantic = semanticExplosion(object.name);
          const objectName = object.name.toLowerCase();
          const isAnchor = currentDefinition.anchors.includes(objectName);
          const direction = semantic?.direction || (!isAnchor ? spatialExplosion(object, children, index) : null);
          if (direction) {
            const depthDistance = depth === 1 ? .23 : depth === 2 ? .105 : .072;
            parts.push({
              object,
              assembled: object.position.clone(),
              offset: worldDirectionToLocal(object, direction).multiplyScalar(modelExtent * depthDistance * (semantic?.distance || 1)),
              detail: depth > 1
            });
          }
          if (object.children.length) visit(object, depth + 1);
        });
      };
      visit(assembly, 1);
      return parts;
    };

    const setExplosion = (progress) => {
      const mainProgress = smoothstep(0, .68, progress);
      const detailProgress = smoothstep(.22, 1, progress);
      explosionParts.forEach(({ object, assembled, offset, detail }) => {
        object.position.copy(assembled).addScaledVector(offset, detail ? detailProgress : mainProgress);
      });
      const fitProgress = Math.max(mainProgress, detailProgress * .9);
      explosionScale = 1 - fitProgress * .36;
      const percentage = Math.round(progress * 100);
      explodeInput.style.setProperty("--disassembly-position", `${percentage}%`);
      if (explodeOutput) explodeOutput.textContent = `${percentage}%`;
      explodeInput.setAttribute("aria-valuetext", progress === 0
        ? "Assembled"
        : progress < .55 ? "Main modules separated" : "All components separated");
    };

    const fitModel = () => {
      tiltRoot.rotation.set(0, 0, 0);
      turntableRoot.rotation.set(0, 0, 0);
      stageRoot.scale.setScalar(1);
      modelOffsetRoot.position.set(0, 0, 0);
      stageRoot.updateMatrixWorld(true);
      orientationRoot.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(orientationRoot);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      modelExtent = Math.max(size.x, size.y, size.z) || 1;
      modelHeight = size.z || modelExtent * .35;
      modelOffsetRoot.position.set(-center.x, -center.y, -bounds.min.z + modelExtent * .035);
      assembly = model.getObjectByName(currentDefinition.rootName) || model;
      explosionParts = buildExplosionParts();
      camera.near = modelExtent / 500;
      camera.far = modelExtent * 20;
      camera.position.set(0, -modelExtent * 1.12, modelHeight * .46 + modelExtent * .2);
      camera.lookAt(0, 0, modelHeight * .46);
      camera.updateProjectionMatrix();
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * pixelRatio) || canvas.height !== Math.round(height * pixelRatio)) {
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
    };

    canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      drag = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!drag) return;
      yaw += (event.clientX - drag.x) * .006;
      pitch += (event.clientY - drag.y) * .004;
      pitch = Math.max(-.42, Math.min(.42, pitch));
      drag = { x: event.clientX, y: event.clientY };
    });
    const releasePointer = () => { drag = null; };
    canvas.addEventListener("pointerup", releasePointer);
    canvas.addEventListener("pointercancel", releasePointer);

    const syncExplosion = () => {
      const minimum = Number(explodeInput.min);
      const maximum = Number(explodeInput.max);
      const value = Math.max(minimum, Math.min(maximum, Number(explodeInput.value)));
      setExplosion((value - minimum) / (maximum - minimum));
    };

    const retractDisassembly = (generation, signal) => {
      const startValue = Number(explodeInput.value);
      const setValue = (value) => {
        explodeInput.value = String(value);
        syncExplosion();
      };
      if (reduceMotion || startValue <= 0) {
        if (generation === loadGeneration && !signal.aborted) setValue(0);
        return Promise.resolve();
      }

      const duration = 240 + startValue * 1.8;
      const startedAt = performance.now();
      return new Promise((resolve) => {
        const animate = (now) => {
          if (generation !== loadGeneration || signal.aborted) {
            resolve();
            return;
          }
          const progress = Math.min(1, (now - startedAt) / duration);
          const eased = progress < .5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;
          setValue(startValue * (1 - eased));
          if (progress < 1) {
            window.requestAnimationFrame(animate);
          } else {
            setValue(0);
            resolve();
          }
        };
        window.requestAnimationFrame(animate);
      });
    };

    explodeInput.addEventListener("input", syncExplosion);
    syncExplosion();
    new ResizeObserver(resize).observe(canvas);
    document.addEventListener("sectionentered", (event) => {
      if (event.detail?.incoming === section) resize();
    });

    const render = (now) => {
      window.requestAnimationFrame(render);
      if (!isVisible()) return;
      resize();
      const delta = Math.min(.05, (now - lastFrame) / 1000);
      lastFrame = now;
      if (ready && !drag && !reduceMotion) yaw += delta * .055;
      tiltRoot.rotation.x = pitch;
      turntableRoot.rotation.z = yaw;
      stageRoot.scale.setScalar(explosionScale);
      renderer.render(scene, camera);
    };

    const disposeModel = (root) => {
      if (!root) return;
      const geometries = new Set();
      const materials = new Set();
      const textures = new Set();
      root.traverse((object) => {
        if (!object.isMesh) return;
        if (object.geometry) geometries.add(object.geometry);
        const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
        objectMaterials.filter(Boolean).forEach((material) => materials.add(material));
      });
      materials.forEach((material) => {
        Object.values(material).forEach((value) => {
          if (value?.isTexture) textures.add(value);
        });
      });
      root.removeFromParent();
      textures.forEach((texture) => texture.dispose());
      materials.forEach((material) => material.dispose());
      geometries.forEach((geometry) => geometry.dispose());
    };

    const setSelectedModel = (definition) => {
      modelButtons.forEach((button) => {
        const active = button.dataset.modelKey === definition.key;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      if (kicker) kicker.textContent = `${definition.label} / INTERACTIVE ASSEMBLY`;
      viewer.setAttribute("aria-label", `Interactive 3D ${definition.label} scale-model assembly. Drag to rotate and use the slider to separate every retained component.`);
      canvas.setAttribute("aria-label", `Interactive 3D ${definition.label} model. Drag to rotate.`);
    };

    const waitForModelFadeOut = () => {
      if (reduceMotion || !model) return Promise.resolve();
      stage.classList.add("is-model-switching");
      return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          canvas.removeEventListener("transitionend", onTransitionEnd);
          resolve();
        };
        const onTransitionEnd = (event) => {
          if (event.target === canvas && event.propertyName === "opacity") finish();
        };
        canvas.addEventListener("transitionend", onTransitionEnd);
        window.setTimeout(finish, modelFadeDuration + 80);
      });
    };

    const fadeModelIn = (generation) => {
      renderer.render(scene, camera);
      if (reduceMotion) {
        stage.classList.remove("is-model-switching");
        return;
      }
      window.requestAnimationFrame(() => {
        if (generation !== loadGeneration) return;
        window.requestAnimationFrame(() => {
          if (generation === loadGeneration) stage.classList.remove("is-model-switching");
        });
      });
    };

    const loadModel = async (key) => {
      const definition = modelDefinitions[key];
      if (!definition) return;
      if (ready && model && definition === currentDefinition) {
        setSelectedModel(definition);
        status.textContent = `${definition.componentCount} COMPONENTS · FULL HIERARCHY`;
        status.classList.remove("is-error");
        status.classList.add("is-ready");
        return;
      }

      const generation = ++loadGeneration;
      loadingController?.abort();
      const controller = new AbortController();
      loadingController = controller;
      ready = false;
      setSelectedModel(definition);
      viewer.setAttribute("aria-busy", "true");
      explodeInput.disabled = true;
      status.classList.remove("is-ready", "is-error");
      status.textContent = `LOADING ${definition.label}`;
      if (!model) stage.classList.add("is-model-switching");

      try {
        const [loadedModel] = await Promise.all([
          readGlb(definition.url, { signal: controller.signal }),
          retractDisassembly(generation, controller.signal)
        ]);
        if (generation !== loadGeneration) {
          disposeModel(loadedModel);
          return;
        }

        await waitForModelFadeOut();
        if (generation !== loadGeneration) {
          disposeModel(loadedModel);
          return;
        }

        const previousModel = model;
        model = loadedModel;
        currentDefinition = definition;
        assembly = null;
        explosionParts = [];
        orientationRoot.add(model);
        if (previousModel) disposeModel(previousModel);

        yaw = -.1;
        pitch = .03;
        fitModel();
        syncExplosion();
        lastFrame = performance.now();
        ready = true;
        fadeModelIn(generation);
        status.textContent = `${definition.componentCount} COMPONENTS · FULL HIERARCHY`;
        status.classList.add("is-ready");
        viewer.removeAttribute("aria-busy");
      } catch (error) {
        if (error.name === "AbortError" || generation !== loadGeneration) return;
        controller.abort();
        console.error("Model Making viewer:", error);
        ready = Boolean(model);
        stage.classList.remove("is-model-switching");
        if (model) setSelectedModel(currentDefinition);
        status.textContent = `${definition.label} UNAVAILABLE`;
        status.classList.add("is-error");
        viewer.removeAttribute("aria-busy");
      } finally {
        if (loadingController === controller) {
          loadingController = null;
          explodeInput.disabled = false;
        }
      }
    };

    modelButtons.forEach((button) => button.addEventListener("click", () => loadModel(button.dataset.modelKey)));
    loadModel(modelButtons.find((button) => button.classList.contains("active"))?.dataset.modelKey || "akm");
    window.requestAnimationFrame(render);
  };

  const updatePageNavigation = (name) => {
    pageNavs.forEach((nav) => {
      const isActive = nav.dataset.pageNav === name;
      nav.classList.toggle("active", isActive);
      nav.hidden = !isActive;
      if (!isActive) return;

      const view = views.find((item) => item.dataset.view === name);
      const section = currentSection(view);
      setActivePageLink(nav, nav.querySelector(`a[href="#${section.id}"]`) || nav.querySelector("a"));
    });
  };

  const applyViewTheme = (name) => {
    document.body.dataset.section = name;
    document.dispatchEvent(new CustomEvent("sectionthemechange", { detail: { name } }));
  };

  const showView = (name) => {
    views.forEach((view) => {
      const isActive = view.dataset.view === name;
      view.classList.toggle("active", isActive);
      view.setAttribute("aria-hidden", String(!isActive));
      view.toggleAttribute("inert", !isActive);
      if (isActive) view.scrollTop = 0;
    });
    activeName = name;
    updatePageNavigation(name);
  };

  const runPendingView = () => {
    if (!pendingName || pendingName === activeName) {
      pendingName = null;
      return;
    }
    const nextName = pendingName;
    pendingName = null;
    activateView(nextName, false);
  };

  const activateView = async (name, updateHistory = false) => {
    if (!viewNames.includes(name)) return;

    if (updateHistory && window.location.hash !== `#${name}`) {
      window.history.pushState({ view: name }, "", `#${name}`);
    }

    if (switching || sectionSwitching) {
      pendingName = name;
      return;
    }
    if (name === activeName) return;

    switching = true;
    const outgoing = views.find((view) => view.dataset.view === activeName);
    const incoming = views.find((view) => view.dataset.view === name);
    document.dispatchEvent(new CustomEvent("viewleaving", { detail: { outgoing, incoming } }));
    const outgoingNav = pageNavs.find((nav) => nav.dataset.pageNav === activeName);
    const incomingNav = pageNavs.find((nav) => nav.dataset.pageNav === name);
    const requestedSectionId = window.location.hash.slice(1);
    const requestedSection = document.getElementById(requestedSectionId);
    const requestedLink = requestedSection
      && incoming.contains(requestedSection)
      && requestedSection.classList.contains("page-section")
      ? incomingNav?.querySelector(`a[href="#${requestedSectionId}"]`)
      : null;
    const firstLink = requestedLink || incomingNav?.querySelector("a");
    const firstSection = firstLink ? document.getElementById(firstLink.hash.slice(1)) : null;
    if (firstSection && incoming.contains(firstSection)) {
      showPageSection(incoming, firstSection);
      setActivePageLink(incomingNav, firstLink);
      if (firstSection.querySelector("[data-thermal-pager]")) {
        document.dispatchEvent(new CustomEvent("thermalpagerreset"));
      }
      if (firstSection.querySelector("[data-locallink-subpager]")) {
        document.dispatchEvent(new CustomEvent("locallinkpagerreset"));
      }
    }
    const incomingContent = animationList(incoming);
    const incomingLinks = navList(incomingNav);
    const incomingPhotographyFrames = appleWebKitPhotography && name === "photography"
      ? [...incoming.querySelectorAll(".page-section.active .photography-frame:not([hidden])")]
      : [];
    prepareSafariPhotographyFrames(incomingPhotographyFrames);
    const incomingPhotographyReady = incomingPhotographyFrames.length
      ? settlePhotographyImages(incomingPhotographyFrames)
      : null;
    setOpacity(incomingContent, 0);
    setOpacity(incomingLinks, 0);

    await Promise.all([
      fadeList(animationList(outgoing), false),
      fadeList(navList(outgoingNav), false)
    ]);

    applyViewTheme(name);
    updatePrimaryNavigation(name);

    showView(name);
    void incoming.offsetWidth;

    if (incomingPhotographyReady) {
      await incomingPhotographyReady;
      setOpacity(incomingPhotographyFrames, 1);
      await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
      incomingPhotographyFrames.forEach((frame) => frame.style.removeProperty("transition"));
    }

    await Promise.all([
      fadeList(incomingContent, true),
      fadeList(incomingLinks, true)
    ]);
    document.dispatchEvent(new CustomEvent("viewentered", { detail: { outgoing, incoming } }));

    switching = false;
    runPendingView();
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", (event) => {
      event.preventDefault();
      activateView(tab.dataset.viewTarget, true);
    });
  });

  pageNavs.forEach((nav) => {
    nav.addEventListener("click", async (event) => {
      const link = event.target.closest("a");
      if (!link) return;
      event.preventDefault();

      const view = views.find((item) => item.dataset.view === nav.dataset.pageNav);
      const target = document.getElementById(link.hash.slice(1));
      const outgoing = currentSection(view);
      if (!target || !view.contains(target) || !target.classList.contains("page-section")) return;
      if (target === outgoing || switching || sectionSwitching) return;

      sectionSwitching = true;
      document.dispatchEvent(new CustomEvent("sectionleaving", { detail: { outgoing, incoming: target } }));
      setActivePageLink(nav, link);
      window.history.replaceState({ view: nav.dataset.pageNav }, "", link.hash);
      const photographySwitch = view?.dataset.view === "photography"
        && outgoing?.querySelector(".photography-contact-sheet")
        && target.querySelector(".photography-contact-sheet");
      const incomingPhotographyFrames = photographySwitch
        ? [...target.querySelectorAll(".photography-frame:not([hidden])")]
        : [];
      prepareSafariPhotographyFrames(incomingPhotographyFrames);
      const incomingPhotographyReady = appleWebKitPhotography && incomingPhotographyFrames.length
        ? settlePhotographyImages(incomingPhotographyFrames)
        : null;
      const outgoingElements = animationList(outgoing);
      const outgoingStandard = photographySwitch
        ? outgoingElements.filter((element) => !element.closest(".photography-gallery"))
        : outgoingElements;
      await Promise.all([
        fadeList(outgoingStandard, false),
        photographySwitch ? animatePhotographyRows(outgoing, false) : Promise.resolve()
      ]);

      if (target.querySelector("[data-thermal-pager]")) {
        document.dispatchEvent(new CustomEvent("thermalpagerreset"));
      }
      if (target.querySelector("[data-research-subpager]")) {
        document.dispatchEvent(new CustomEvent("researchpagerreset"));
      }
      if (target.querySelector("[data-acoustic-subpager]")) {
        document.dispatchEvent(new CustomEvent("acousticpagerreset"));
      }
      if (target.querySelector("[data-publications-pager]")) {
        document.dispatchEvent(new CustomEvent("publicationspagerreset"));
      }
      if (target.querySelector("[data-locallink-subpager]")) {
        document.dispatchEvent(new CustomEvent("locallinkpagerreset"));
      }
      const incoming = animationList(target);
      const incomingStandard = photographySwitch
        ? incoming.filter((element) => !element.closest(".photography-gallery"))
        : incoming;
      setOpacity(incomingStandard, 0);
      showPageSection(view, target);
      void target.offsetWidth;
      if (photographySwitch) resetPhotographyGallery(target.querySelector(".photography-gallery"));
      await Promise.all([
        fadeList(incomingStandard, true),
        photographySwitch ? animatePhotographyRows(target, true, incomingPhotographyReady) : Promise.resolve()
      ]);
      document.dispatchEvent(new CustomEvent("sectionentered", { detail: { outgoing, incoming: target } }));

      sectionSwitching = false;
      runPendingView();
    });
  });

  window.addEventListener("popstate", () => activateView(viewFromHash()));
  window.addEventListener("hashchange", () => activateView(viewFromHash()));

  const initialName = viewFromHash();
  const initialView = views.find((view) => view.dataset.view === initialName);
  const initialTarget = document.getElementById(window.location.hash.slice(1));
  if (initialTarget && initialView.contains(initialTarget) && initialTarget.classList.contains("page-section")) {
    showPageSection(initialView, initialTarget);
  }

  activeName = initialName;
  applyViewTheme(activeName);
  updatePrimaryNavigation(activeName);
  showView(activeName);
  views.forEach((view) => {
    setOpacity(animationList(view), view.dataset.view === activeName ? 1 : 0);
  });
  pageNavs.forEach((nav) => {
    setOpacity(navList(nav), nav.dataset.pageNav === activeName ? 1 : 0);
  });
  initThermalDemo();
  initMoeDemo();
  initMoeRouting();
  initMoeAnimation();
  initMusicMixer();
  initDeviceModel();
  initMarsbotModel();
  initModelMakingViewer();
  initCrackInspectionDemo();
  initArControlInterface();
  initThermalPager();
  initResearchPager();
  initLocalLinkAppGallery();
  initLocalLinkPager();
  initLocalLinkSystemMap();
  initLocalLinkCalendar();
  initLocalLinkMatrix();
  initMiddleMouseGuard();
  initPhotographyGalleries();
  initPublicationsPager();
  initAcousticPager();
  initAcousticDemo();
  initSkillsNetwork();
  initResearchMindmap();
})();
