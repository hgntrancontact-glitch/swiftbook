const fs = require('fs');
let code = fs.readFileSync('/app/applet/src/utils/shapeRecognizer.ts', 'utf8');

// 1. OVAL: replace PRE-CHECK with our new logic
code = code.replace(
/\/\/ PRE-CHECK \/ HIGH PRIORITY: CIRCLE \/ OVAL[\s\S]*?(?=\/\/ \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-[\r\n]+\s*\/\/ A\. TRIANGLE)/,
`// PRE-CHECK / HIGH PRIORITY: CIRCLE / OVAL (Continuous Arc Curvature Check)
  // When drawing sweeps continuously around centroid without sharp corners (sharpCornerCount === 0),
  // immediately recognize Circle/Oval with gaps up to 35% - 40% (angular span >= 3.6 rad ~ 206 deg).
  // ----------------------------------------------------
  const verySharpCorners = detectedCorners.filter((c) => c.angleDeg < 60);
  const isContinuousCurvature = verySharpCorners.length === 0 && totalAngCovered >= 3.6 && isCircleGapTolerant;

  if (isContinuousCurvature) {
    const isSquareLike = Math.abs(bboxWidth - bboxHeight) / bboxDiag < 0.22;
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
      shapeType: isSquareLike ? 'circle' : 'ellipse',
      isRecognized: true,
    };
  }
  `
);

// 2. TRIANGLE: strictly check sharpCorners.length === 3
code = code.replace(
/\/\/ If exactly 3 distinct vertices found[\s\S]*?(?=\/\/ \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-[\r\n]+\s*\/\/ B\. 4\-SIDED POLYGONS)/,
`// If exactly 3 distinct vertices found
    // User constraint: Chỉ nắn thành Tam giác khi phát hiện ĐÚNG 3 đỉnh có góc gập rõ rệt
    if (distinctVertices.length === 3 && sharpCornerCount >= 2) { // Allow start/end merge as 1 corner
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

// 3. RECTANGLE: strictly check rightAngleCorners.length === 4
code = code.replace(
/const isRectCandidate =[\s\S]*?if \(isRectCandidate\) \{/,
`const isRectCandidate = rightAngleCorners.length === 4;
  if (isRectCandidate) {`
);

// 4. Remove fallback CIRCLE / ELLIPSE logic since we unified it
code = code.replace(
/\/\/ \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-[\r\n]+\s*\/\/ C\. CIRCLE \/ ELLIPSE[\s\S]*?(?=\/\/ \=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=\=[\r\n]+\s*\/\/ FALLBACK)/,
``
);

fs.writeFileSync('/app/applet/src/utils/shapeRecognizer.ts', code);
