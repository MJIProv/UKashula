/**
 * UkashulaVisionBoard — PROTOTYPE, NOT PRODUCTION CODE.
 *
 * Babylon.js "Vision Board" for Grow-Your-Own-Home (GYWH). A grower spends
 * gamified points (1 point = 1 kg of hemp bio-composite) to place structures
 * on a 3D plot. The ledger here is a React state object, NOT the real
 * append-only Merkle ledger in `UKC-GROW-YOUR-OWN-HOME/domain/`. Nothing in
 * this file is wired to that domain core, to The Heart, or to Fabric.
 *
 * What this file does NOT do, and does not claim to do:
 *   - no physics engine, no stress analysis, no structural verification
 *   - no signed ledger, no consensus, no double-entry, no persistence
 *   - no certified strength figures (see GEOMETRY_GATE below, and README)
 *
 * Mirrors the domain core's P8 convention: every structural surface reads
 * "design check only, not certified".
 *
 * See ./README.md for the defect register and the open decisions.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as BABYLON from '@babylonjs/core';
// NOTE (defect 6): '@babylonjs/core/Physics/physicsEngineComponent' used to be
// imported here. It was never used — no physics engine was ever enabled, no
// impostor was ever created. The import is removed rather than made true,
// because making it true is a separate piece of work with its own evidence
// requirements. See GEOMETRY_GATE.

// =============================================================================
// CONFIG — the single place to change the demo's economics and geometry.
// =============================================================================

export type MassModel = 'bounding_box' | 'shell';
export type StructureType = 'vault' | 'flat';

/**
 * DEFECT 1 — THE SUCCESS PATH IS UNREACHABLE, AND THE ROOT CAUSE IS A PRODUCT
 * DECISION, NOT A CODE DECISION. This object exists so the decision can be
 * made by changing one value, with the consequences written down first.
 *
 * Mass model:  M_req = ceil(V * rho * (1 + safetyMargin))
 *   rho = 330 kg/m^3, safetyMargin = 0.15 (DIMENSIONLESS, a 15% mass buffer —
 *   it is NOT a stress and NOT measured in MPa; the original code's comment
 *   conflated it with a tensile threshold. See defect 6.)
 *
 * -----------------------------------------------------------------------------
 * MASS_MODEL = 'bounding_box'   (DEFAULT — preserves the original behaviour)
 * -----------------------------------------------------------------------------
 * V = the axis-aligned bounding box of the mesh. For the vault that is
 * diameter * diameter * length, i.e. the solid cube the cylinder sits inside.
 *
 *   vault  V = 4 * 4 * 4   = 64 m^3  -> ceil(64 * 330 * 1.15)   = 24,288 kg
 *   flat   V = 6 * 0.5 * 4 = 12 m^3  -> ceil(12 * 330 * 1.15)   =  4,554 kg
 *
 * -----------------------------------------------------------------------------
 * MASS_MODEL = 'shell'
 * -----------------------------------------------------------------------------
 * A vault is a SHELL, not a solid: only the wall is made of material. Volume
 * is the cylindrical annulus, V = pi * (R^2 - (R - t)^2) * L, with R = 2 m
 * (diameter 4), L = 4 m, t = vault.wallThicknessM.
 *
 *   t = 0.30 m  V = 13.9487 m^3 -> ceil(13.9487 * 330 * 1.15) = 5,294 kg
 *   t = 0.20 m  V =  9.5504 m^3 ->                              3,625 kg
 *   t = 0.10 m  V =  4.9009 m^3 ->                              1,860 kg
 *
 * The flat span is NOT re-modelled under 'shell': a 0.5 m slab is already a
 * solid slab, so it stays 4,554 kg in both models. Only the vault changes.
 *
 * -----------------------------------------------------------------------------
 * WHAT SEED BALANCE EACH MODEL IMPLIES
 * -----------------------------------------------------------------------------
 * The flat span is rejected by the geometry gate BEFORE the ledger is touched,
 * so a flat never debits. Only vaults spend points. Therefore:
 *
 *   model                 one vault   seed to confirm 1   seed to confirm 2
 *   bounding_box          24,288 kg          24,288 kg           48,576 kg
 *   shell, t = 0.30 m      5,294 kg           5,294 kg           10,588 kg
 *   shell, t = 0.10 m      1,860 kg           1,860 kg            3,720 kg
 *
 * To exercise BOTH the confirm and the reject path in one session, seed a
 * balance between "confirm 1" and "confirm 2":
 *   bounding_box      -> seedGamifiedPointsKg = 30,000
 *   shell t = 0.30 m  -> seedGamifiedPointsKg =  8,000
 *
 * THE FINDING THE PRODUCT OWNER NEEDS: switching to 'shell' does NOT rescue
 * the shipped seed balance of 1,200 kg. It only shrinks the shortfall from
 * 20.24x to 4.41x (at t = 0.30 m). A 1,200 kg balance buys 3.64 m^3 of
 * composite at 330 kg/m^3 — less than a 100 mm shell on a 4 m x 4 m vault
 * (1,860 kg). So the seed balance has to move whichever mass model is chosen,
 * OR the demo vault has to get smaller. That is a Founder/Board call in the
 * same class as the open accrual mechanism in `UKC-GROW-YOUR-OWN-HOME/SPEC.md`
 * section 4. This file does not pick a winner.
 */
export const VISION_BOARD_CONFIG = {
  /** DEFECT 1 SWITCH. One-line edit. 'bounding_box' = unchanged behaviour. */
  MASS_MODEL: 'bounding_box' as MassModel,

  /**
   * Hemp bio-composite density, kg/m^3.
   * [NOT VERIFIED] carried from the original file. Not checked against the
   * Canonical Data Sheet.
   */
  hempCompositeDensityKgM3: 330,

  /**
   * Mass buffer, DIMENSIONLESS (0.15 = 15% more material than the bare
   * volume). Not a stress. Not MPa.
   * A 0.85 source coefficient is recorded in the README correction.
   * Whether to multiply by 1.15 or divide by 0.85 remains unresolved (2.30%).
   */
  safetyMargin: 0.15,

  /**
   * Opening balances for the simulated 80/20 payout waterfall.
   * seedGamifiedPointsKg is the DEFECT 1 lever (see the block above).
   */
  seedGamifiedPointsKg: 1200,
  seedFiatBalanceRand: 4500,

  /** Catenary-vault demo geometry. Cylinder laid on its side. */
  vault: {
    diameterM: 4,
    /** Length along the plot (the cylinder's own height before rotation). */
    lengthM: 4,
    /** Only read when MASS_MODEL === 'shell'. 0.3 m ~ a typical hemp-lime wall. */
    wallThicknessM: 0.3,
    tessellation: 24,
  },

  /** Flat-roof-span demo geometry. */
  flat: {
    widthM: 6,
    thicknessM: 0.5,
    depthM: 4,
    /** Height of the slab's centre above the plot. */
    roofHeightM: 4,
  },

  /** DEFECT 5 — deterministic placement grid on the 30 x 30 m plot. */
  grid: {
    /** Centre-to-centre spacing. 7 m clears the 6 m flat span. */
    spacingM: 7,
    /** columns x columns cells, so columns^2 = board capacity. */
    columns: 4,
  },

  /** Simulated consensus / web-worker delay before a verdict, ms. */
  consensusDelayMs: 1500,

  /**
   * DEFECT 6 — the "physics check" is a GEOMETRY WHITELIST, and is labelled as
   * one. It compares a string against a list of compression-only forms. It
   * performs no stress calculation of any kind.
   */
  geometryGate: {
    /**
     * Design target, not a laboratory result. The earlier comparison against
     * uncompacted hemp-lime was withdrawn in README on 2026-10-10.
     * Used only as a displayed assumption, never a structural pass/fail test.
     * Lab data and engineer sign-off remain required by P8.
     */
    assumedCompressiveStrengthMPa: 7.0,
    /** Forms the whitelist accepts. Compression-only geometry. */
    compressionOnlyGeometries: ['vault'] as readonly StructureType[],
    /** Matches the domain core's custodyReleaseStatus() label exactly. */
    disclaimer: 'design check only, not certified',
  },
} as const;

// =============================================================================
// PURE MODEL FUNCTIONS
// =============================================================================

/** Volume used for the mass charge, m^3. Depends on MASS_MODEL. */
export function structureVolumeM3(
  type: StructureType,
  model: MassModel = VISION_BOARD_CONFIG.MASS_MODEL,
): number {
  const { vault, flat } = VISION_BOARD_CONFIG;

  if (type === 'flat') {
    // A 0.5 m slab is a solid slab in both models. Unchanged by MASS_MODEL.
    return flat.widthM * flat.thicknessM * flat.depthM;
  }

  if (model === 'shell') {
    const outerR = vault.diameterM / 2;
    const innerR = Math.max(0, outerR - vault.wallThicknessM);
    return Math.PI * (outerR * outerR - innerR * innerR) * vault.lengthM;
  }

  // 'bounding_box' — the original behaviour, preserved exactly:
  // W * H * D where W = H = diameter and D = length. 4 * 4 * 4 = 64.
  return vault.diameterM * vault.diameterM * vault.lengthM;
}

/** M_req = ceil(V * rho * (1 + safetyMargin)), kg. */
export function calculateStructuralMassKg(volumeM3: number): number {
  const { hempCompositeDensityKgM3, safetyMargin } = VISION_BOARD_CONFIG;
  return Math.ceil(volumeM3 * hempCompositeDensityKgM3 * (1 + safetyMargin));
}

export interface GeometryGateResult {
  readonly passes: boolean;
  /** Always shown next to any verdict. Never asserts verification. */
  readonly disclaimer: string;
  readonly detail: string;
}

/**
 * DEFECT 6 — honest replacement for the fake "Physics Engine Check".
 *
 * This is a geometry whitelist, not a structural check. It reads the
 * assumed-strength constant only to report it as an assumption; the constant
 * is NOT compared against any computed stress, because no stress is computed.
 */
export function geometryHeuristic(type: StructureType): GeometryGateResult {
  const { assumedCompressiveStrengthMPa, compressionOnlyGeometries, disclaimer } =
    VISION_BOARD_CONFIG.geometryGate;

  const label =
    `${disclaimer} — assumed compressive strength ` +
    `${assumedCompressiveStrengthMPa.toFixed(1)} MPa [NOT VERIFIED]`;

  if (compressionOnlyGeometries.includes(type)) {
    return {
      passes: true,
      disclaimer: label,
      detail:
        'Compression-only geometry, accepted by the whitelist. No stress ' +
        'analysis was performed.',
    };
  }

  return {
    passes: false,
    disclaimer: label,
    detail:
      'Not a compression-only geometry. Hemp-lime is comparatively strong in ' +
      'compression and weak in tension, and a flat span puts its soffit in ' +
      'tension — so the whitelist rejects it. This is a geometry rule, not a ' +
      'calculated result: no span, load, moment or stress was evaluated.',
  };
}

/** Grid cell index -> plot coordinates. Deterministic, legible, no DnD. */
export function cellToPosition(
  cell: number,
  type: StructureType,
): { x: number; y: number; z: number } {
  const { grid, vault, flat } = VISION_BOARD_CONFIG;
  const col = cell % grid.columns;
  const row = Math.floor(cell / grid.columns);
  const offset = (grid.columns - 1) / 2;

  return {
    x: (col - offset) * grid.spacingM,
    // Vault: cylinder on its side, so its centre sits one radius up and the
    // mesh rests on the plot. Flat: a roof slab at roof height.
    y: type === 'vault' ? vault.diameterM / 2 : flat.roofHeightM,
    z: (row - offset) * grid.spacingM,
  };
}

export const BOARD_CAPACITY = VISION_BOARD_CONFIG.grid.columns ** 2;

// =============================================================================
// LEDGER + BOARD TYPES
// =============================================================================

export type SettlementOutcome = 'confirmed' | 'rejected_insufficient_points';

/**
 * One settled decision. Appended, never edited — the same shape of discipline
 * as `EventChain` in the domain core, minus the hashing (this is a prototype
 * and is NOT a ledger of record).
 */
export interface Settlement {
  readonly txnId: number;
  readonly type: StructureType;
  readonly requiredMassKg: number;
  readonly outcome: SettlementOutcome;
  readonly balanceAfterKg: number;
}

export interface GrowerLedger {
  /** 80% Stripe payout leg. Display only here. */
  readonly fiatBalanceRand: number;
  /** 20% vision-board leg. 1 point = 1 kg of usable bio-composite. */
  readonly gamifiedPointsKg: number;
  readonly settlements: readonly Settlement[];
}

export type PlacementStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected_geometry'
  | 'rejected_ledger';

export interface Placement {
  readonly txnId: number;
  readonly type: StructureType;
  readonly requiredMassKg: number;
  readonly cell: number;
  readonly status: PlacementStatus;
  readonly note: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function UkashulaVisionBoard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // DEFECT (dead state): `const [engine, setEngine]` was written and never
  // read, costing a render on mount for nothing. Engine and scene are
  // imperative Babylon handles, so they live in refs. `sceneReady` is the one
  // boolean the render actually needs, to gate the buttons.
  const engineRef = useRef<BABYLON.Engine | null>(null);
  const sceneRef = useRef<BABYLON.Scene | null>(null);
  const [sceneReady, setSceneReady] = useState(false);

  const [ledger, setLedger] = useState<GrowerLedger>({
    fiatBalanceRand: VISION_BOARD_CONFIG.seedFiatBalanceRand,
    gamifiedPointsKg: VISION_BOARD_CONFIG.seedGamifiedPointsKg,
    settlements: [],
  });

  const [placements, setPlacements] = useState<readonly Placement[]>([]);
  const [buildStatus, setBuildStatus] = useState<string>('Awaiting design...');

  // Imperative bookkeeping that must be correct ACROSS two clicks in the same
  // tick, so it cannot live in React state (state reads are stale until the
  // next render — that is exactly defect 2).
  const meshesRef = useRef<Map<number, BABYLON.Mesh>>(new Map());
  const occupiedCellsRef = useRef<Set<number>>(new Set());
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const nextTxnIdRef = useRef(1);
  const settledThroughRef = useRef(0);
  const mountedRef = useRef(true);

  // ---------------------------------------------------------------------------
  // Scene lifecycle
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    mountedRef.current = true;

    const engine = new BABYLON.Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });
    engineRef.current = engine;

    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.1, 0.1, 0.15, 1);

    const camera = new BABYLON.ArcRotateCamera(
      'camera',
      Math.PI / 4,
      Math.PI / 3,
      28,
      BABYLON.Vector3.Zero(),
      scene,
    );
    // @babylonjs/core >= 5.0.0 signature: attachControl(noPreventDefault?).
    // The attachControl(element, noPreventDefault) overload the original file
    // used was deprecated in 5.0. This repo pins NO Babylon version — there is
    // no package.json anywhere in it — so this uses the >= 5 signature and the
    // README records that the version is unverified. On 4.x the element
    // overload would be required instead.
    camera.attachControl(true);
    camera.lowerRadiusLimit = 5;
    camera.upperRadiusLimit = 60;

    const light = new BABYLON.HemisphericLight(
      'light',
      new BABYLON.Vector3(0, 1, 0),
      scene,
    );
    light.intensity = 0.8;

    const dirLight = new BABYLON.DirectionalLight(
      'dirLight',
      new BABYLON.Vector3(-1, -2, -1),
      scene,
    );
    dirLight.intensity = 0.5;

    // Plot. Stands in for a CesiumJS WGS84 allocation; it is a flat 30 m
    // square and nothing more.
    const ground = BABYLON.MeshBuilder.CreateGround(
      'plot',
      { width: 30, height: 30 },
      scene,
    );
    const groundMat = new BABYLON.StandardMaterial('groundMat', scene);
    groundMat.diffuseColor = new BABYLON.Color3(0.15, 0.2, 0.15);
    groundMat.specularColor = new BABYLON.Color3(0, 0, 0);
    ground.material = groundMat;

    sceneRef.current = scene;
    setSceneReady(true);

    engine.runRenderLoop(() => scene.render());

    const resize = () => engine.resize();
    window.addEventListener('resize', resize);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('resize', resize);

      // Any in-flight verdict would fire into a disposed scene.
      for (const t of timersRef.current) clearTimeout(t);
      timersRef.current.clear();

      // The meshes die with the scene, so the React model must agree with
      // that, or the board would render rows for structures that no longer
      // exist. Under React 18 StrictMode this cleanup runs once on the
      // simulated unmount, which resets the board but NOT the ledger — see
      // the README's Unverified Register.
      meshesRef.current.clear();
      occupiedCellsRef.current.clear();
      setPlacements([]);
      setSceneReady(false);

      scene.dispose();
      engine.dispose();
      sceneRef.current = null;
      engineRef.current = null;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Materials and disposal
  // ---------------------------------------------------------------------------

  const makePendingMaterial = (scene: BABYLON.Scene, txnId: number) => {
    const mat = new BABYLON.StandardMaterial(`pendingMat_${txnId}`, scene);
    mat.diffuseColor = new BABYLON.Color3(0.5, 0.8, 1.0);
    mat.emissiveColor = new BABYLON.Color3(0.1, 0.3, 0.5);
    mat.alpha = 0.4;
    return mat;
  };

  /**
   * DEFECT 4 (half of it) — `mesh.dispose()` with no arguments leaves the
   * StandardMaterial alive, so every rollback leaked one. Babylon's signature
   * is dispose(doNotRecurse?, disposeMaterialAndTextures?), so the second
   * argument is the fix. Safe here because every structure mesh owns its own
   * material (created per txnId above); the only shared material is the
   * ground's, and the ground is never passed to this function.
   */
  const disposeStructure = useCallback((txnId: number) => {
    const mesh = meshesRef.current.get(txnId);
    meshesRef.current.delete(txnId);
    if (mesh) mesh.dispose(false, true);
  }, []);

  // `removePlacement` is called from button handlers and from Babylon
  // animation callbacks, so it reads the current placements through a ref
  // rather than being re-created on every placement change.
  const placementsRef = useRef<readonly Placement[]>(placements);
  useEffect(() => {
    placementsRef.current = placements;
  }, [placements]);

  /** Releases a cell and removes the row. Frees the grid slot for a retry. */
  const removePlacement = useCallback(
    (txnId: number) => {
      const target = placementsRef.current.find((p) => p.txnId === txnId);
      if (target) occupiedCellsRef.current.delete(target.cell);
      disposeStructure(txnId);
      setPlacements((prev) => prev.filter((p) => p.txnId !== txnId));
    },
    [disposeStructure],
  );

  // ---------------------------------------------------------------------------
  // DEFECT 2 — atomic check-and-debit
  // ---------------------------------------------------------------------------
  //
  // The original read `ledger.gamifiedPoints` from the closure (stale) and
  // debited with a functional updater (fresh). Two clicks inside the 1.5 s
  // window both saw the pre-debit balance, both passed, and both debited, so
  // the balance could go negative.
  //
  // CHOSEN APPROACH: the check and the debit happen in ONE functional updater,
  // which is the only place that can see the authoritative `prev`. The updater
  // is PURE — it mutates no mesh, calls no other setState, writes no ref — so
  // React 18 StrictMode's double invocation is harmless. It records its verdict
  // as an appended `Settlement`, i.e. the decision becomes part of the state.
  // A separate effect then drains the new settlements and performs the visual
  // side effects. A txnId guard makes a replayed updater a no-op.
  //
  // The grid occupancy set is deliberately NOT handled this way: it is claimed
  // synchronously in a ref during the click, because two clicks in the same
  // tick must not be handed the same cell, and ref writes are immediate.

  const settle = useCallback((txnId: number, type: StructureType, requiredMassKg: number) => {
    setLedger((prev) => {
      if (prev.settlements.some((s) => s.txnId === txnId)) return prev; // idempotent
      const affordable = prev.gamifiedPointsKg >= requiredMassKg;
      const balanceAfterKg = affordable
        ? prev.gamifiedPointsKg - requiredMassKg
        : prev.gamifiedPointsKg;
      return {
        ...prev,
        gamifiedPointsKg: balanceAfterKg,
        settlements: [
          ...prev.settlements,
          {
            txnId,
            type,
            requiredMassKg,
            outcome: affordable ? 'confirmed' : 'rejected_insufficient_points',
            balanceAfterKg,
          },
        ],
      };
    });
  }, []);

  /** Red flash + alpha fade, then dispose. Used for a ledger rejection. */
  const dissolveAndRemove = useCallback(
    (txnId: number) => {
      const mesh = meshesRef.current.get(txnId);
      const mat = mesh?.material as BABYLON.StandardMaterial | null | undefined;
      if (!mesh || !mat) {
        removePlacement(txnId);
        return;
      }
      mat.emissiveColor = new BABYLON.Color3(1, 0, 0);
      BABYLON.Animation.CreateAndStartAnimation(
        `dissolve_${txnId}`,
        mat,
        'alpha',
        60,
        30,
        mat.alpha,
        0,
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT,
        new BABYLON.SineEase(),
        () => {
          if (!mountedRef.current) return;
          removePlacement(txnId);
        },
      );
    },
    [removePlacement],
  );

  // Drain settlements: apply each verdict to the scene and the board exactly
  // once. Idempotent via settledThroughRef, so a StrictMode re-run is a no-op.
  useEffect(() => {
    const { settlements } = ledger;
    while (settledThroughRef.current < settlements.length) {
      const s = settlements[settledThroughRef.current];
      settledThroughRef.current += 1;

      if (s.outcome === 'confirmed') {
        const mesh = meshesRef.current.get(s.txnId);
        const scene = sceneRef.current;
        if (mesh && scene) {
          const previous = mesh.material;
          const finalMat = new BABYLON.StandardMaterial(`finalMat_${s.txnId}`, scene);
          finalMat.diffuseColor = new BABYLON.Color3(0.8, 0.75, 0.65);
          finalMat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
          mesh.material = finalMat;
          // Same leak as defect 4: swapping a material does not free the old
          // one. The pending hologram material is this mesh's own, so it is
          // safe to dispose outright.
          previous?.dispose();
        }
        setPlacements((prev) =>
          prev.map((p) =>
            p.txnId === s.txnId
              ? {
                  ...p,
                  status: 'confirmed',
                  note: `Debited ${s.requiredMassKg.toLocaleString()} kg.`,
                }
              : p,
          ),
        );
        setBuildStatus(
          `Transaction settled: ${s.requiredMassKg.toLocaleString()} kg debited, ` +
            `${s.balanceAfterKg.toLocaleString()} kg remaining. ` +
            `${VISION_BOARD_CONFIG.geometryGate.disclaimer} — no structural ` +
            `verification was performed.`,
        );
      } else {
        setPlacements((prev) =>
          prev.map((p) =>
            p.txnId === s.txnId
              ? { ...p, status: 'rejected_ledger', note: 'Rolling back.' }
              : p,
          ),
        );
        setBuildStatus(
          `Ledger rejected: ${s.requiredMassKg.toLocaleString()} kg required, ` +
            `${s.balanceAfterKg.toLocaleString()} kg available. Rolling back.`,
        );
        dissolveAndRemove(s.txnId);
      }
    }
  }, [ledger, dissolveAndRemove]);

  // ---------------------------------------------------------------------------
  // Placement
  // ---------------------------------------------------------------------------

  const addStructuralBlock = useCallback(
    (type: StructureType) => {
      const scene = sceneRef.current;
      if (!scene) return;

      // DEFECT 5 — claim the lowest free grid cell. Synchronous ref write, so
      // two clicks in the same tick get different cells instead of z-fighting
      // at the origin.
      let cell = -1;
      for (let i = 0; i < BOARD_CAPACITY; i += 1) {
        if (!occupiedCellsRef.current.has(i)) {
          cell = i;
          break;
        }
      }
      if (cell === -1) {
        setBuildStatus(
          `Plot full: ${BOARD_CAPACITY} cells occupied. Remove a structure to place another.`,
        );
        return;
      }
      occupiedCellsRef.current.add(cell);

      const txnId = nextTxnIdRef.current;
      nextTxnIdRef.current += 1;

      const requiredMassKg = calculateStructuralMassKg(structureVolumeM3(type));
      const { x, y, z } = cellToPosition(cell, type);
      const { vault, flat } = VISION_BOARD_CONFIG;

      let mesh: BABYLON.Mesh;
      if (type === 'vault') {
        mesh = BABYLON.MeshBuilder.CreateCylinder(
          `vault_${txnId}`,
          {
            diameter: vault.diameterM,
            height: vault.lengthM,
            tessellation: vault.tessellation,
          },
          scene,
        );
        mesh.rotation.x = Math.PI / 2; // lay it on its side
      } else {
        mesh = BABYLON.MeshBuilder.CreateBox(
          `flatRoof_${txnId}`,
          { width: flat.widthM, height: flat.thicknessM, depth: flat.depthM },
          scene,
        );
      }
      mesh.position.set(x, y, z);
      mesh.material = makePendingMaterial(scene, txnId);
      meshesRef.current.set(txnId, mesh);

      // DEFECT 3 — `massRequired` is no longer an accumulator that only grows.
      // It is derived below from the placements that actually exist, so a
      // rejection removes its own contribution automatically.
      setPlacements((prev) => [
        ...prev,
        {
          txnId,
          type,
          requiredMassKg,
          cell,
          status: 'pending',
          note: `Cell ${cell}. Awaiting verdict.`,
        },
      ]);
      setBuildStatus(
        `Checking geometry and ledger for ${type} #${txnId} ` +
          `(${requiredMassKg.toLocaleString()} kg)...`,
      );

      const timer = setTimeout(() => {
        timersRef.current.delete(timer);
        if (!mountedRef.current) return;

        // Gate order is unchanged: geometry first, so a rejected design is
        // never debited.
        const gate = geometryHeuristic(type);
        if (!gate.passes) {
          // DEFECT 4 — the original set the mesh red and returned: no dispose,
          // no record, no way for the user to get rid of it. Now it is a
          // tracked, removable placement.
          const mat = meshesRef.current.get(txnId)?.material as
            | BABYLON.StandardMaterial
            | null
            | undefined;
          if (mat) {
            mat.emissiveColor = new BABYLON.Color3(1, 0, 0);
            mat.alpha = 0.8;
          }
          setPlacements((prev) =>
            prev.map((p) =>
              p.txnId === txnId
                ? { ...p, status: 'rejected_geometry', note: gate.detail }
                : p,
            ),
          );
          setBuildStatus(
            `Geometry rejected (whitelist, not a stress check): ${gate.detail} ` +
              `Nothing was debited. Use Remove to clear it.`,
          );
          return;
        }

        settle(txnId, type, requiredMassKg);
      }, VISION_BOARD_CONFIG.consensusDelayMs);

      timersRef.current.add(timer);
    },
    [settle],
  );

  const clearRejected = useCallback(() => {
    for (const p of placementsRef.current) {
      if (p.status === 'rejected_geometry' || p.status === 'rejected_ledger') {
        removePlacement(p.txnId);
      }
    }
  }, [removePlacement]);

  // ---------------------------------------------------------------------------
  // Derived figures (DEFECT 3)
  // ---------------------------------------------------------------------------

  const confirmedMassKg = useMemo(
    () =>
      placements
        .filter((p) => p.status === 'confirmed')
        .reduce((sum, p) => sum + p.requiredMassKg, 0),
    [placements],
  );

  const pendingMassKg = useMemo(
    () =>
      placements
        .filter((p) => p.status === 'pending')
        .reduce((sum, p) => sum + p.requiredMassKg, 0),
    [placements],
  );

  const rejectedCount = placements.filter(
    (p) => p.status === 'rejected_geometry' || p.status === 'rejected_ledger',
  ).length;

  const statusIsBad = /reject|full/i.test(buildStatus);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const panel: React.CSSProperties = {
    position: 'absolute',
    top: 20,
    left: 20,
    width: 360,
    maxHeight: 'calc(100vh - 40px)',
    overflowY: 'auto',
    padding: 20,
    backgroundColor: 'rgba(20, 25, 30, 0.88)',
    backdropFilter: 'blur(10px)',
    borderRadius: 16,
    color: '#fff',
    fontFamily: 'system-ui, sans-serif',
    border: '1px solid rgba(255,255,255,0.1)',
    boxSizing: 'border-box',
  };

  const button: React.CSSProperties = {
    flex: 1,
    padding: '10px',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 'bold',
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        backgroundColor: '#111',
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', outline: 'none' }} />

      <div style={panel}>
        <div
          style={{
            marginBottom: 14,
            padding: '8px 10px',
            borderRadius: 8,
            backgroundColor: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.5)',
            fontSize: '0.72rem',
            lineHeight: 1.45,
            color: '#fcd34d',
          }}
        >
          <strong>PROTOTYPE — NOT PRODUCTION.</strong> Simulated ledger, no
          physics engine, no structural verification.{' '}
          {VISION_BOARD_CONFIG.geometryGate.disclaimer}. Assumed compressive
          strength{' '}
          {VISION_BOARD_CONFIG.geometryGate.assumedCompressiveStrengthMPa.toFixed(1)}{' '}
          MPa is <strong>[NOT VERIFIED]</strong>.
        </div>

        <h2 style={{ margin: '0 0 10px 0', fontSize: '1.15rem', color: '#4ade80' }}>
          20% Gamified Tier Ledger (simulated)
        </h2>

        <div style={{ marginBottom: 14 }}>
          <p style={{ margin: '4px 0', fontSize: '0.85rem', color: '#aaa' }}>
            Available bio-composite:
          </p>
          <h3 style={{ margin: 0, fontSize: '1.7rem', color: '#f59e0b' }}>
            {ledger.gamifiedPointsKg.toLocaleString()} kg
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#777' }}>
            Fiat leg (display only): R
            {ledger.fiatBalanceRand.toLocaleString()}
          </p>
        </div>

        <div
          style={{
            marginBottom: 16,
            padding: 10,
            backgroundColor: 'rgba(0,0,0,0.5)',
            borderRadius: 8,
            fontSize: '0.8rem',
          }}
        >
          <p style={{ margin: '0 0 6px 0', color: '#888' }}>
            M_req = ceil(V &times; {VISION_BOARD_CONFIG.hempCompositeDensityKgM3} &times;
            (1 + {VISION_BOARD_CONFIG.safetyMargin})) &nbsp;|&nbsp; model:{' '}
            <code style={{ color: '#93c5fd' }}>{VISION_BOARD_CONFIG.MASS_MODEL}</code>
          </p>
          <p style={{ margin: '0 0 3px 0' }}>
            Built mass: <span style={{ color: '#fff' }}>{confirmedMassKg.toLocaleString()} kg</span>
          </p>
          <p style={{ margin: 0, color: '#9ca3af' }}>
            In flight: {pendingMassKg.toLocaleString()} kg
          </p>
        </div>

        <p
          style={{
            fontSize: '0.82rem',
            lineHeight: 1.45,
            color: statusIsBad ? '#ef4444' : '#60a5fa',
            minHeight: 54,
          }}
        >
          {buildStatus}
        </p>

        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <button
            type="button"
            disabled={!sceneReady}
            onClick={() => addStructuralBlock('vault')}
            style={{ ...button, backgroundColor: sceneReady ? '#3b82f6' : '#334155' }}
          >
            + Catenary Vault
          </button>
          <button
            type="button"
            disabled={!sceneReady}
            onClick={() => addStructuralBlock('flat')}
            style={{ ...button, backgroundColor: sceneReady ? '#4b5563' : '#334155' }}
          >
            + Flat Span
          </button>
        </div>

        <button
          type="button"
          disabled={rejectedCount === 0}
          onClick={clearRejected}
          style={{
            ...button,
            width: '100%',
            marginTop: 10,
            fontWeight: 'normal',
            backgroundColor: rejectedCount > 0 ? '#7f1d1d' : '#27272a',
            cursor: rejectedCount > 0 ? 'pointer' : 'default',
          }}
        >
          Clear failed placements ({rejectedCount})
        </button>

        <h4 style={{ margin: '18px 0 6px 0', fontSize: '0.85rem', color: '#9ca3af' }}>
          Board — {placements.length}/{BOARD_CAPACITY} cells
        </h4>
        {placements.length === 0 && (
          <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: 0 }}>
            Nothing placed yet.
          </p>
        )}
        {placements.map((p) => (
          <div
            key={p.txnId}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              padding: '6px 0',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              fontSize: '0.75rem',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ color: '#e5e7eb' }}>
                #{p.txnId} {p.type} &middot; cell {p.cell} &middot;{' '}
                {p.requiredMassKg.toLocaleString()} kg
              </div>
              <div
                style={{
                  color:
                    p.status === 'confirmed'
                      ? '#4ade80'
                      : p.status === 'pending'
                        ? '#60a5fa'
                        : '#ef4444',
                }}
              >
                {p.status}
              </div>
              <div style={{ color: '#6b7280', lineHeight: 1.35 }}>{p.note}</div>
            </div>
            <button
              type="button"
              onClick={() => removePlacement(p.txnId)}
              style={{
                padding: '4px 8px',
                fontSize: '0.7rem',
                color: '#fca5a5',
                background: 'transparent',
                border: '1px solid rgba(252,165,165,0.4)',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
