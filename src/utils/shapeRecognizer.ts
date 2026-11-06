import { DrawingPoint } from '../types';

export type SmartShapeType =
  | 'line'
  | 'arrow'
  | 'circle'
  | 'ellipse'
  | 'square'
  | 'rectangle'
  | 'triangle'
  | 'parallelogram'
  | 'trapezoid'
  | 'freehand';

export interface RecognizedShapeResult {
  points: DrawingPoint[];
  shapeType: SmartShapeType;
  isRecognized: boolean;
}

/**
 * Distance between two points in percentage coordinates
 */
function distance(p1: DrawingPoint, p2: DrawingPoint): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Resample polyline points uniformly by arc length
 */
function resamplePoints(points: DrawingPoint[], numSamples = 64): DrawingPoint[] {
  if (points.length <= 1) return points;
  let totalLen = 0;
  for (let i = 1; i < points.length; i++) {
    totalLen += distance(points[i - 1], points[i]);
  }
  if (totalLen === 0) return points;

  const segmentLen = totalLen / (numSamples - 1);
  const result: DrawingPoint[] = [{ ...points[0] }];
  let accumulated = 0;
  let pointIdx = 0;
  const pts = points.map((p) => ({ ...p }));

  while (result.length < numSamples && pointIdx < pts.length - 1) {
    const p1 = pts[pointIdx];
    const p2 = pts[pointIdx + 1];
    const d = distance(p1, p2);

    if (accumulated + d >= segmentLen) {
      const t = (segmentLen - accumulated) / (d || 0.0001);
      const newPt = {
        x: p1.x + t * (p2.x - p1.x),
        y: p1.y + t * (p2.y - p1.y),
      };
      result.push(newPt);
      accumulated = 0;
      pts[pointIdx] = newPt;
    } else {
      accumulated += d;
      pointIdx++;
    }
  }

  while (result.length < numSamples) {
    result.push({ ...pts[pts.length - 1] });
  }

  return result;
}

/**
 * Detect sharp corners / vertices by calculating direction changes (angles)
 */
function detectCorners(
  resampled: DrawingPoint[],
  isClosed: boolean,
  kRange = [3, 4]
): { index: number; pt: DrawingPoint; angleDeg: number }[] {
  const n = resampled.length;
  const maxK = Math.max(...kRange);
  if (n < 2 * maxK + 1) return [];

  const angles: { index: number; angleDeg: number }[] = [];

  const getPt = (idx: number) => {
    if (isClosed) {
      return resampled[((idx % n) + n) % n];
    }
    return resampled[Math.max(0, Math.min(n - 1, idx))];
  };

  const startIdx = isClosed ? 0 : maxK;
  const endIdx = isClosed ? n : n - maxK;

  for (let i = startIdx; i < endIdx; i++) {
    let minAngleForPoint = 180;

    for (const k of kRange) {
      const prev = getPt(i - k);
      const curr = getPt(i);
      const next = getPt(i + k);

      const v1x = prev.x - curr.x;
      const v1y = prev.y - curr.y;
      const v2x = next.x - curr.x;
      const v2y = next.y - curr.y;

      const mag1 = Math.hypot(v1x, v1y);
      const mag2 = Math.hypot(v2x, v2y);

      if (mag1 * mag2 > 0) {
        const dot = (v1x * v2x + v1y * v2y) / (mag1 * mag2);
        const clampedDot = Math.max(-1, Math.min(1, dot));
        const angleDeg = (Math.acos(clampedDot) * 180) / Math.PI;
        if (angleDeg < minAngleForPoint) {
          minAngleForPoint = angleDeg;
        }
      }
    }

    // A turn or corner candidate (anything below 120°)
    if (minAngleForPoint < 120) {
      angles.push({ index: i, angleDeg: minAngleForPoint });
    }
  }

  // Non-maximum suppression (finding local minima of angles within neighborhood)
  const candidateCorners: { index: number; pt: DrawingPoint; angleDeg: number }[] = [];
  const suppressRadius = 4;
  for (const item of angles) {
    let isLocalMin = true;
    for (const other of angles) {
      let idxDiff = Math.abs(item.index - other.index);
      if (isClosed) {
        idxDiff = Math.min(idxDiff, n - idxDiff);
      }
      if (idxDiff <= suppressRadius && other.angleDeg < item.angleDeg) {
        isLocalMin = false;
        break;
      }
    }
    if (isLocalMin) {
      const tooClose = candidateCorners.some((c) => {
        let diff = Math.abs(c.index - item.index);
        if (isClosed) diff = Math.min(diff, n - diff);
        return diff <= suppressRadius * 1.5;
      });
      if (!tooClose) {
        candidateCorners.push({
          index: item.index,
          pt: resampled[item.index],
          angleDeg: item.angleDeg,
        });
      }
    }
  }

  return candidateCorners;
}

/**
 * Calculate distance from a point to a line segment
 */
function distToSegment(p: DrawingPoint, v: DrawingPoint, w: DrawingPoint): number {
  const l2 = (v.x - w.x) * (v.x - w.x) + (v.y - w.y) * (v.y - w.y);
  if (l2 === 0) return distance(p, v);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return distance(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
}

/**
 * Ramer-Douglas-Peucker (RDP) curve simplification algorithm
 */
function ramerDouglasPeucker(pts: DrawingPoint[], epsilon: number): DrawingPoint[] {
  if (pts.length < 3) return pts;
  let dmax = 0;
  let index = 0;
  const end = pts.length - 1;

  for (let i = 1; i < end; i++) {
    const d = distToSegment(pts[i], pts[0], pts[end]);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  if (dmax > epsilon) {
    const rec1 = ramerDouglasPeucker(pts.slice(0, index + 1), epsilon);
    const rec2 = ramerDouglasPeucker(pts.slice(index), epsilon);
    return rec1.slice(0, rec1.length - 1).concat(rec2);
  } else {
    return [pts[0], pts[end]];
  }
}

/**
 * Trim overshoot / overlap / hook artifacts at start and end of a closed loop
 */
function cleanClosedLoop(pts: DrawingPoint[], bboxDiag: number): DrawingPoint[] {
  if (pts.length < 8) return pts;
  const n = pts.length;
  const pStart = pts[0];
  const pEnd = pts[n - 1];
  const directDist = distance(pStart, pEnd);

  // If endpoints are already virtually touching
  if (directDist < bboxDiag * 0.05) {
    return pts;
  }

  // Check if end point overshoots into the start region (find closest index near start)
  let bestStartIdx = 0;
  let minDistToStart = directDist;
  const checkLimit = Math.floor(n * 0.25);
  for (let i = 1; i < checkLimit; i++) {
    const d = distance(pts[i], pEnd);
    if (d < minDistToStart) {
      minDistToStart = d;
      bestStartIdx = i;
    }
  }

  // Check if start point overshoots into the end region
  let bestEndIdx = n - 1;
  let minDistToEnd = directDist;
  for (let i = n - 2; i >= n - checkLimit; i--) {
    const d = distance(pts[i], pStart);
    if (d < minDistToEnd) {
      minDistToEnd = d;
      bestEndIdx = i;
    }
  }

  let trimmed = pts;
  if (bestStartIdx > 0 && minDistToStart < bboxDiag * 0.12) {
    trimmed = trimmed.slice(bestStartIdx);
  }
  if (bestEndIdx < n - 1 && minDistToEnd < bboxDiag * 0.12) {
    trimmed = trimmed.slice(0, bestEndIdx + 1);
  }

  return trimmed;
}

/**
 * Calculate interior angles for a closed polygon vertices [V0, V1, ..., Vn-1]
 */
function calculateInteriorAngles(vertices: DrawingPoint[]): number[] {
  const n = vertices.length;
  if (n < 3) return [];
  const angles: number[] = [];

  for (let i = 0; i < n; i++) {
    const prev = vertices[(i - 1 + n) % n];
    const curr = vertices[i];
    const next = vertices[(i + 1) % n];

    const v1x = prev.x - curr.x;
    const v1y = prev.y - curr.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;

    const mag1 = Math.hypot(v1x, v1y);
    const mag2 = Math.hypot(v2x, v2y);

    if (mag1 * mag2 > 0) {
      const dot = (v1x * v2x + v1y * v2y) / (mag1 * mag2);
      const clampedDot = Math.max(-1, Math.min(1, dot));
      angles.push((Math.acos(clampedDot) * 180) / Math.PI);
    } else {
      angles.push(180);
    }
  }

  return angles;
}

/**
 * Extract stable polygon vertices using Ramer-Douglas-Peucker (RDP) & Corner Detection
 */
function findPolygonVertices(
  pts: DrawingPoint[],
  bboxDiag: number,
  isClosed: boolean
): {
  vertices: DrawingPoint[];
  interiorAngles: number[];
  angleSum: number;
  sharpCornerCount: number;
} {
  const cleaned = isClosed ? cleanClosedLoop(pts, bboxDiag) : pts;
  const resampled = resamplePoints(cleaned, 64);
  const n = resampled.length;

  // 1. Detect candidate corners from angular changes
  const detectedCorners = detectCorners(resampled, isClosed, [3, 4]);

  // 2. Multi-epsilon RDP to identify stable polygon vertices
  const epsList = [bboxDiag * 0.05, bboxDiag * 0.07, bboxDiag * 0.09];
  let candidateVertices: DrawingPoint[] = [];

  for (const eps of epsList) {
    const rdp = ramerDouglasPeucker(resampled, eps);
    for (const pt of rdp) {
      if (!candidateVertices.some((v) => distance(v, pt) < bboxDiag * 0.12)) {
        candidateVertices.push(pt);
      }
    }
  }

  // Also include high-confidence detected corners
  for (const dc of detectedCorners) {
    if (dc.angleDeg < 115) {
      if (!candidateVertices.some((v) => distance(v, dc.pt) < bboxDiag * 0.12)) {
        candidateVertices.push(dc.pt);
      }
    }
  }

  // Sort candidate vertices according to their appearance along the resampled path
  const getIdxOnPath = (pt: DrawingPoint) => {
    let minD = Infinity;
    let bestIdx = 0;
    for (let i = 0; i < n; i++) {
      const d = distance(pt, resampled[i]);
      if (d < minD) {
        minD = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  };
  candidateVertices.sort((a, b) => getIdxOnPath(a) - getIdxOnPath(b));

  // Merge vertices that are too close (< 15% of bboxDiag)
  const merged: DrawingPoint[] = [];
  for (const v of candidateVertices) {
    if (merged.length === 0) {
      merged.push(v);
    } else {
      const last = merged[merged.length - 1];
      if (distance(last, v) < bboxDiag * 0.15) {
        merged[merged.length - 1] = {
          x: (last.x + v.x) / 2,
          y: (last.y + v.y) / 2,
        };
      } else {
        merged.push(v);
      }
    }
  }

  // If closed, check if first and last should be merged
  if (merged.length > 2 && isClosed) {
    if (distance(merged[0], merged[merged.length - 1]) < bboxDiag * 0.20) {
      const last = merged.pop()!;
      merged[0] = {
        x: (merged[0].x + last.x) / 2,
        y: (merged[0].y + last.y) / 2,
      };
    }
  }

  const interiorAngles = calculateInteriorAngles(merged);
  const angleSum = interiorAngles.reduce((sum, a) => sum + a, 0);
  const sharpCornerCount = interiorAngles.filter((a) => a < 115).length;

  return { vertices: merged, interiorAngles, angleSum, sharpCornerCount };
}

/**
 * Detailed recognition of smart shapes with accurate corner detection, confidence scoring,
 * loose tolerance for Circles/Rectangles, strict tolerance for Triangles, and freehand fallback.
 */
export function recognizeSmartShapeDetailed(
  points: DrawingPoint[]
): { points: DrawingPoint[]; shapeType: string; isRecognized: boolean } {
  if (!points || points.length < 3) {
    return { points, shapeType: 'freehand', isRecognized: false };
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const bboxWidth = maxX - minX;
  const bboxHeight = maxY - minY;
  const bboxDiag = Math.sqrt(bboxWidth * bboxWidth + bboxHeight * bboxHeight);

  if (bboxDiag < 0.8) {
    return { points, shapeType: 'freehand', isRecognized: false };
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const pStart = points[0];
  const pEnd = points[points.length - 1];
  const directDist = distance(pStart, pEnd);

  let pathLen = 0;
  for (let i = 1; i < points.length; i++) {
    pathLen += distance(points[i - 1], points[i]);
  }

  // Calculate Shoelace Polygon Area
  let polyArea = 0;
  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length];
    polyArea += points[i].x * next.y - next.x * points[i].y;
  }
  polyArea = Math.abs(polyArea) / 2;
  const bboxArea = bboxWidth * bboxHeight;
  const areaRatio = bboxArea > 0 ? polyArea / bboxArea : 0;

  // Straightness ratio: direct distance between endpoints vs path length
  const straightness = pathLen > 0 ? directDist / pathLen : 0;

  // ==========================================
  // CASE 1: STRAIGHT LINE CHECK
  // ==========================================
  if (straightness > 0.90) {
    let maxDev = 0;
    for (const p of points) {
      const dev = distToSegment(p, pStart, pEnd);
      if (dev > maxDev) maxDev = dev;
    }
    const relativeDev = bboxDiag > 0 ? maxDev / bboxDiag : 1;

    if (relativeDev < 0.10) {
      let lineStart = { ...pStart };
      let lineEnd = { ...pEnd };

      // Snap to pure horizontal or vertical if slope is near 0 or 90 deg
      if (Math.abs(pStart.y - pEnd.y) < Math.max(1.8, bboxHeight * 0.15)) {
        const avgY = (pStart.y + pEnd.y) / 2;
        lineStart.y = avgY;
        lineEnd.y = avgY;
      } else if (Math.abs(pStart.x - pEnd.x) < Math.max(1.8, bboxWidth * 0.15)) {
        const avgX = (pStart.x + pEnd.x) / 2;
        lineStart.x = avgX;
        lineEnd.x = avgX;
      }

      return {
        points: [lineStart, lineEnd],
        shapeType: 'line',
        isRecognized: true,
      };
    }
  }

  // ==========================================
  // CASE 2: ARROW GESTURE CHECK
  // ==========================================
  if (points.length > 10) {
    const shaftEndIdx = Math.floor(points.length * 0.75);
    let shaftPathLen = 0;
    for (let i = 1; i <= shaftEndIdx; i++) {
      shaftPathLen += distance(points[i - 1], points[i]);
    }
    const shaftDirectDist = distance(pStart, points[shaftEndIdx]);
    const shaftStraightness = shaftPathLen > 0 ? shaftDirectDist / shaftPathLen : 0;

    // Only evaluate arrowhead if shaft itself is straight (> 0.85)
    if (shaftStraightness > 0.85) {
      const vMainX = points[shaftEndIdx].x - pStart.x;
      const vMainY = points[shaftEndIdx].y - pStart.y;
      const magMain = Math.sqrt(vMainX * vMainX + vMainY * vMainY);

      let maxBacktrack = 0;
      for (let i = shaftEndIdx; i < points.length - 1; i++) {
        const vPartX = points[i + 1].x - points[i].x;
        const vPartY = points[i + 1].y - points[i].y;
        const dot = (vPartX * vMainX + vPartY * vMainY) / (magMain || 1);
        if (dot < -0.4) {
          maxBacktrack = Math.max(maxBacktrack, -dot);
        }
      }
      if (maxBacktrack > 0.6) {
        const theta = Math.atan2(pEnd.y - pStart.y, pEnd.x - pStart.x);
        const arrowLen = Math.max(3.0, Math.min(10.0, directDist * 0.25));
        return {
          points: [
            pStart,
            pEnd,
            {
              x: pEnd.x - arrowLen * Math.cos(theta - Math.PI / 6),
              y: pEnd.y - arrowLen * Math.sin(theta - Math.PI / 6),
            },
            pEnd,
            {
              x: pEnd.x - arrowLen * Math.cos(theta + Math.PI / 6),
              y: pEnd.y - arrowLen * Math.sin(theta + Math.PI / 6),
            },
          ],
          shapeType: 'arrow',
          isRecognized: true,
        };
      }
    }
  }

  // ==========================================
  // CLOSURE & ARC CURVATURE ANALYSIS FOR CIRCLE / OVAL / POLYGONS
  // ==========================================
  // Triangle closure: start & end can have a natural hand-drawn gap up to 30% of bboxDiag or 3.5% canvas
  const isTriangleClosed = directDist <= Math.max(3.5, bboxDiag * 0.32) || pathLen > directDist * 1.35;

  // Circle / Oval & Polygons loose closure:
  // - Gap tolerance: up to 35% - 40% gap relative to perimeter
  // - Or when the drawn path is significantly longer than the straight direct distance
  const estPerimeter = Math.PI * ((bboxWidth + bboxHeight) / 2);
  const gapRatio = estPerimeter > 0 ? directDist / estPerimeter : 1;
  const isCircleGapTolerant = gapRatio <= 0.40 || directDist <= Math.max(5.0, bboxDiag * 0.48) || pathLen > directDist * 1.30;
  const isLooselyClosed = isCircleGapTolerant;

  // Compute angular coverage around centroid (cx, cy)
  let prevAng = 0;
  let totalAngCovered = 0;
  for (let i = 0; i < points.length; i++) {
    const ang = Math.atan2(points[i].y - cy, points[i].x - cx);
    if (i > 0) {
      let diff = ang - prevAng;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      totalAngCovered += Math.abs(diff);
    }
    prevAng = ang;
  }

  // If path is completely open without curvature (e.g. simple checkmark, stroke, handwriting) -> Freehand
  if (!isLooselyClosed && !isTriangleClosed && totalAngCovered < 3.5) {
    return {
      points,
      shapeType: 'freehand',
      isRecognized: false,
    };
  }

  const resampled = resamplePoints(points, 64);
  const nResampled = resampled.length;

  // Calculate closed polygon area & perimeter for Isoperimetric Ratio (Roundness)
  let resampledPolyArea = 0;
  let perimeter = 0;
  for (let i = 0; i < nResampled; i++) {
    const curr = resampled[i];
    const next = resampled[(i + 1) % nResampled];
    resampledPolyArea += curr.x * next.y - next.x * curr.y;
    perimeter += distance(curr, next);
  }
  resampledPolyArea = Math.abs(resampledPolyArea) / 2;

  // Roundness = (4 * PI * Area) / (Perimeter^2)
  // Perfect circle ~ 1.0, Square ~ PI/4 ≈ 0.785, Rectangle < 0.785
  const roundness = perimeter > 0 ? (4 * Math.PI * resampledPolyArea) / (perimeter * perimeter) : 0;

  // Extract polygon vertices using RDP curve simplification & corner analysis
  const polyAnalysis = findPolygonVertices(points, bboxDiag, isTriangleClosed || isLooselyClosed);
  const { vertices: polyVertices, interiorAngles: polyAngles, angleSum: polyAngleSum } = polyAnalysis;

  // Corner and Angle Detection
  const detectedCorners = detectCorners(resampled, isLooselyClosed, [3, 4]);

  // Sharp corners (< 100 deg)
  const sharpCorners = detectedCorners.filter((c) => c.angleDeg < 100);
  const sharpCornerCount = sharpCorners.length;

  // Right-angle corners (65° to 105° turn angle) for Rectangle / Square recognition
  const rightAngleCorners = detectedCorners.filter((c) => c.angleDeg >= 65 && c.angleDeg <= 105);

  // Helper to generate Circle / Ellipse points
  const makeCircleOrEllipse = () => {
    const isSquareLike = Math.abs(bboxWidth - bboxHeight) / bboxDiag < 0.18;
    let radiusX = bboxWidth / 2;
    let radiusY = bboxHeight / 2;
    if (isSquareLike) {
      radiusX = radiusY = (radiusX + radiusY) / 2;
    }

    const circlePoints: DrawingPoint[] = [];
    const numSegments = 36;
    for (let i = 0; i <= numSegments; i++) {
      const angle = (i / numSegments) * Math.PI * 2;
      circlePoints.push({
        x: cx + radiusX * Math.cos(angle),
        y: cy + radiusY * Math.sin(angle),
      });
    }
    return {
      points: circlePoints,
      shapeType: (isSquareLike ? 'circle' : 'ellipse') as SmartShapeType,
      isRecognized: true,
    };
  };

  // ----------------------------------------------------
  // 1. CIRCLE / ELLIPSE: CONTINUOUS CURVATURE & ISOPERIMETRIC RATIO (ROUNDNESS)
  // - 0 sharp corners (< 100°), continuous smooth curvature loop
  // - Roundness > 0.78 and no distinct 4 corners / right angles
  // - Single end hook with roundness > 0.72 & angular coverage >= 4.0 rad
  // ----------------------------------------------------
  const isZeroSharp = sharpCornerCount === 0 && (isCircleGapTolerant || totalAngCovered >= 3.5);
  const isHighRoundness = roundness > 0.78 && sharpCornerCount < 4 && rightAngleCorners.length < 3;
  const isSingleEndHook =
    sharpCornerCount <= 1 &&
    (roundness > 0.72 || totalAngCovered >= 4.0) &&
    isCircleGapTolerant &&
    rightAngleCorners.length < 2 &&
    polyVertices.length !== 3 &&
    polyVertices.length !== 4;

  if (isZeroSharp || isHighRoundness || isSingleEndHook) {
    return makeCircleOrEllipse();
  }

  // ----------------------------------------------------
  // 2. 4-SIDED POLYGONS: RECTANGLE / SQUARE / PARALLELOGRAM / TRAPEZOID
  // Strict 4-vertex & 4-edge constraint (never misclassified as Triangle)
  // Interior angle sum ≈ 360° (290° - 430°) or 4 sharp/right-angle corners detected
  // ----------------------------------------------------
  const has4Vertices = polyVertices.length === 4 && polyAngleSum >= 280 && polyAngleSum <= 440;
  const has4SharpCorners = sharpCornerCount === 4 || rightAngleCorners.length >= 3;
  const isQuadrilateralCandidate = (has4Vertices || has4SharpCorners) && roundness <= 0.82 && polyVertices.length !== 3;

  if (isQuadrilateralCandidate) {
    let totalDev = 0;
    const rectCorners = [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ];
    for (const p of resampled) {
      const d0 = distToSegment(p, rectCorners[0], rectCorners[1]);
      const d1 = distToSegment(p, rectCorners[1], rectCorners[2]);
      const d2 = distToSegment(p, rectCorners[2], rectCorners[3]);
      const d3 = distToSegment(p, rectCorners[3], rectCorners[0]);
      totalDev += Math.min(d0, d1, d2, d3);
    }
    const avgDev = totalDev / resampled.length;
    const relDev = bboxDiag > 0 ? avgDev / bboxDiag : 1;

    // High confidence match for quadrilateral
    if (relDev < 0.25) {
      const upperPoints = points.filter((p) => p.y <= minY + bboxHeight * 0.35);
      const lowerPoints = points.filter((p) => p.y >= maxY - bboxHeight * 0.35);

      const upperAvgX = upperPoints.length
        ? upperPoints.reduce((sum, p) => sum + p.x, 0) / upperPoints.length
        : cx;
      const lowerAvgX = lowerPoints.length
        ? lowerPoints.reduce((sum, p) => sum + p.x, 0) / lowerPoints.length
        : cx;
      const xShift = upperAvgX - lowerAvgX;

      const upperWidth = upperPoints.length
        ? Math.max(...upperPoints.map((p) => p.x)) - Math.min(...upperPoints.map((p) => p.x))
        : bboxWidth;
      const lowerWidth = lowerPoints.length
        ? Math.max(...lowerPoints.map((p) => p.x)) - Math.min(...lowerPoints.map((p) => p.x))
        : bboxWidth;

      // Parallelogram (strong slant > 28%)
      if (Math.abs(xShift) > bboxWidth * 0.28 && rightAngleCorners.length < 2) {
        const slant = Math.abs(xShift) * 0.6;
        if (xShift > 0) {
          return {
            points: [
              { x: minX + slant, y: minY },
              { x: maxX, y: minY },
              { x: maxX - slant, y: maxY },
              { x: minX, y: maxY },
              { x: minX + slant, y: minY },
            ],
            shapeType: 'parallelogram',
            isRecognized: true,
          };
        } else {
          return {
            points: [
              { x: minX, y: minY },
              { x: maxX - slant, y: minY },
              { x: maxX, y: maxY },
              { x: minX + slant, y: maxY },
              { x: minX, y: minY },
            ],
            shapeType: 'parallelogram',
            isRecognized: true,
          };
        }
      }

      // Trapezoid (strong tapering > 40%)
      if ((upperWidth < lowerWidth * 0.60 || lowerWidth < upperWidth * 0.60) && rightAngleCorners.length < 2) {
        if (upperWidth < lowerWidth) {
          const shrink = (bboxWidth - upperWidth) / 2;
          return {
            points: [
              { x: minX + shrink, y: minY },
              { x: maxX - shrink, y: minY },
              { x: maxX, y: maxY },
              { x: minX, y: maxY },
              { x: minX + shrink, y: minY },
            ],
            shapeType: 'trapezoid',
            isRecognized: true,
          };
        } else {
          const shrink = (bboxWidth - lowerWidth) / 2;
          return {
            points: [
              { x: minX, y: minY },
              { x: maxX, y: minY },
              { x: maxX - shrink, y: maxY },
              { x: minX + shrink, y: maxY },
              { x: minX, y: minY },
            ],
            shapeType: 'trapezoid',
            isRecognized: true,
          };
        }
      }

      // Square (Aspect ratio close to 1:1)
      const isSquare = Math.abs(bboxWidth - bboxHeight) / bboxDiag < 0.18;
      if (isSquare) {
        const side = (bboxWidth + bboxHeight) / 2;
        return {
          points: [
            { x: cx - side / 2, y: cy - side / 2 },
            { x: cx + side / 2, y: cy - side / 2 },
            { x: cx + side / 2, y: cy + side / 2 },
            { x: cx - side / 2, y: cy + side / 2 },
            { x: cx - side / 2, y: cy - side / 2 },
          ],
          shapeType: 'square',
          isRecognized: true,
        };
      }

      // Clean Rectangle
      return {
        points: [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
          { x: minX, y: minY },
        ],
        shapeType: 'rectangle',
        isRecognized: true,
      };
    }
  }

  // ----------------------------------------------------
  // 3. TRIANGLE: STRICT 3 VERTICES & 3 SHARP CORNERS
  // - Must have EXACTLY 3 vertices (sum of 3 interior angles ≈ 180°: 135° - 225°)
  // - 3 closed straight segments with low deviation (< 0.18)
  // - Strictly prohibited if shape has 4 vertices or 4 right-angle corners
  // ----------------------------------------------------
  if (isTriangleClosed && !has4Vertices && rightAngleCorners.length < 3) {
    let triVertices: DrawingPoint[] = [];

    if (polyVertices.length === 3) {
      triVertices = polyVertices;
    } else {
      // Fallback corner vertex extraction if RDP was under/over segmented
      let distinctVertices: DrawingPoint[] = [];
      for (const dc of detectedCorners) {
        const isDuplicate = distinctVertices.some(
          (v) => distance(v, dc.pt) < Math.max(2.0, bboxDiag * 0.22)
        );
        if (!isDuplicate) {
          distinctVertices.push(dc.pt);
        }
      }

      if (distinctVertices.length === 2) {
        const midClosure = { x: (pStart.x + pEnd.x) / 2, y: (pStart.y + pEnd.y) / 2 };
        const d0 = distance(midClosure, distinctVertices[0]);
        const d1 = distance(midClosure, distinctVertices[1]);
        if (d0 > bboxDiag * 0.25 && d1 > bboxDiag * 0.25) {
          distinctVertices.push(midClosure);
        }
      }

      if (distinctVertices.length === 3) {
        triVertices = distinctVertices;
      }
    }

    if (triVertices.length === 3) {
      const [c0, c1, c2] = triVertices;
      const angles = calculateInteriorAngles(triVertices);
      const angleSum = angles.reduce((sum, a) => sum + a, 0);

      // Verify all 3 interior angles are valid triangle corners (15° to 135°)
      const validAngles = angles.every((a) => a >= 15 && a <= 135);
      const sumNear180 = angleSum >= 135 && angleSum <= 225;

      const triArea = Math.abs(
        (c0.x * (c1.y - c2.y) + c1.x * (c2.y - c0.y) + c2.x * (c0.y - c1.y)) / 2
      );

      let totalDev = 0;
      for (const p of resampled) {
        const d0 = distToSegment(p, c0, c1);
        const d1 = distToSegment(p, c1, c2);
        const d2 = distToSegment(p, c2, c0);
        totalDev += Math.min(d0, d1, d2);
      }
      const avgDev = totalDev / resampled.length;
      const relDev = bboxDiag > 0 ? avgDev / bboxDiag : 1;

      if (triArea > bboxArea * 0.15 && relDev < 0.18 && (validAngles || sumNear180)) {
        return {
          points: [c0, c1, c2, c0],
          shapeType: 'triangle',
          isRecognized: true,
        };
      }
    }
  }

  // ==========================================
  // FALLBACK: Does not meet any confidence threshold -> KEEP FREEHAND DRAWING
  // ==========================================
  return {
    points,
    shapeType: 'freehand',
    isRecognized: false,
  };
}

/**
 * Backward-compatible helper
 */
export function recognizeSmartShape(points: DrawingPoint[]): DrawingPoint[] {
  return recognizeSmartShapeDetailed(points).points;
}

/**
 * Recognize and snap straight highlight stroke for clean straight lines across text
 */
export function recognizeSmartHighlight(points: DrawingPoint[]): { points: DrawingPoint[]; isRecognized: boolean } {
  if (!points || points.length < 2) return { points, isRecognized: false };

  const pStart = points[0];
  const pEnd = points[points.length - 1];

  let pathLen = 0;
  for (let i = 1; i < points.length; i++) {
    pathLen += distance(points[i - 1], points[i]);
  }
  const directDist = distance(pStart, pEnd);
  const straightness = pathLen > 0 ? directDist / pathLen : 0;

  // Only snap if reasonably straight (> 0.8)
  if (straightness < 0.8) {
    return { points, isRecognized: false };
  }

  const dy = Math.abs(pEnd.y - pStart.y);
  const dx = Math.abs(pEnd.x - pStart.x);

  if (dy < Math.max(3.0, dx * 0.35)) {
    const avgY = (pStart.y + pEnd.y) / 2;
    return {
      points: [
        { x: pStart.x, y: avgY },
        { x: pEnd.x, y: avgY },
      ],
      isRecognized: true,
    };
  }

  if (dx < Math.max(3.0, dy * 0.35)) {
    const avgX = (pStart.x + pEnd.x) / 2;
    return {
      points: [
        { x: avgX, y: pStart.y },
        { x: avgX, y: pEnd.y },
      ],
      isRecognized: true,
    };
  }

  return {
    points: [
      { x: pStart.x, y: pStart.y },
      { x: pEnd.x, y: pEnd.y },
    ],
    isRecognized: true,
  };
}
