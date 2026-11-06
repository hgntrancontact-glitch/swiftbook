const fs = require('fs');
let code = fs.readFileSync('/app/applet/src/utils/shapeRecognizer.ts', 'utf8');

code = code.replace(
/\/\/ PRE-CHECK \/ HIGH PRIORITY: CIRCLE \/ OVAL[\s\S]*?(?=\/\/ \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-[\r\n]+\s*\/\/ A\. TRIANGLE)/,
`// PRE-CHECK / HIGH PRIORITY: CIRCLE / OVAL (Continuous Arc Curvature Check)
  // When drawing sweeps continuously around centroid without sharp corners (sharpCornerCount === 0),
  // immediately recognize Circle/Oval with gaps up to 35% - 40% (angular span >= 3.6 rad ~ 206 deg).
  // ----------------------------------------------------
  if (sharpCornerCount === 0 && cornerCount <= 2 && totalAngCovered >= 3.6 && isCircleGapTolerant) {
    const isSquareLike = Math.abs(bboxWidth - bboxHeight) / bboxDiag < 0.22;
    let radiusX = bboxWidth / 2;
    let radiusY = bboxHeight / 2;
    if (isSquareLike) {
      radiusX = radiusY = (radiusX + radiusY) / 2;
    }

    // Radial distance variance check
    let radDevTotal = 0;
    for (const p of resampled) {
      const normX = (p.x - cx) / (radiusX || 1);
      const normY = (p.y - cy) / (radiusY || 1);
      const rad = Math.sqrt(normX * normX + normY * normY);
      radDevTotal += Math.abs(rad - 1.0);
    }
    const avgRadDev = radDevTotal / resampled.length;

    // High sensitivity threshold: avgRadDev < 0.36
    if (avgRadDev < 0.36) {
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
        shapeType: isSquareLike ? 'circle' : 'ellipse',
        isRecognized: true,
      };
    }
  }
  `
);

code = code.replace(
/\/\/ If exactly 3 distinct vertices found[\s\S]*?(?=\/\/ \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-[\r\n]+\s*\/\/ B\. 4\-SIDED POLYGONS)/,
`// If exactly 3 distinct vertices found
    if (distinctVertices.length === 3) {
      const [c0, c1, c2] = distinctVertices;
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

      // Sensitive Triangle match: non-degenerate area > 16% of bboxArea, relDev < 18%
      if (triArea > bboxArea * 0.16 && relDev < 0.18) {
        return {
          points: [c0, c1, c2, c0],
          shapeType: 'triangle',
          isRecognized: true,
        };
      }
    }
  }
  `
);

code = code.replace(
/const isRectCandidate = rightAngleCorners\.length === 4;[\r\n\s]*if \(isRectCandidate\) \{/,
`const isRectCandidate =
    rightAngleCorners.length >= 2 ||
    cornerCount === 4 ||
    (cornerCount >= 3 && areaRatio >= 0.55) ||
    areaRatio >= 0.72;

  if (isRectCandidate) {`
);

const fallbackStr = `
  // ==========================================
  // FALLBACK: Does not meet any confidence threshold -> KEEP FREEHAND DRAWING
  // ==========================================`;

const circleEllipseLogic = `
  // ----------------------------------------------------
  // C. CIRCLE / ELLIPSE: Continuous smooth curvature around center
  // (Loose closure allowed up to 20%-30% gap, cornerCount <= 1)
  // ----------------------------------------------------
  if (cornerCount <= 1) {
    const isSquareLike = Math.abs(bboxWidth - bboxHeight) / bboxDiag < 0.20;
    let radiusX = bboxWidth / 2;
    let radiusY = bboxHeight / 2;
    if (isSquareLike) {
      radiusX = radiusY = (radiusX + radiusY) / 2;
    }

    // Calculate radial distance variance to check circularity / ellipticity
    let radDevTotal = 0;
    for (const p of resampled) {
      const normX = (p.x - cx) / (radiusX || 1);
      const normY = (p.y - cy) / (radiusY || 1);
      const rad = Math.sqrt(normX * normX + normY * normY);
      radDevTotal += Math.abs(rad - 1.0);
    }
    const avgRadDev = radDevTotal / resampled.length;

    // Check angular span around center (must span at least ~275-300 degrees around center)
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

    // Circularity match: radial deviation < 22%, angular coverage >= 4.8 rad (~275 deg)
    if (avgRadDev < 0.22 && totalAngCovered >= 4.8 && (areaRatio > 0.45 || isLooselyClosed)) {
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
        shapeType: isSquareLike ? 'circle' : 'ellipse',
        isRecognized: true,
      };
    }
  }
`;

code = code.replace(fallbackStr, circleEllipseLogic + fallbackStr);

fs.writeFileSync('/app/applet/src/utils/shapeRecognizer.ts', code);
