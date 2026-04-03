class ImageTracker {
  constructor(options = {}) {
    this.options = {
      blackThreshold: options.blackThreshold || 30,
      minStrokeLength: options.minStrokeLength || 5,
      simplificationTolerance: options.simplificationTolerance || 3,
      minAngleThreshold: options.minAngleThreshold || 30,
      ...options
    };

    this.canvas = null;
    this.ctx = null;
  }

  initCanvas(width = 500, height = 500) {
    if (!this.canvas) {
      this.canvas = wx.createOffscreenCanvas({ type: '2d', width, height });
      this.ctx = this.canvas.getContext('2d');
    } else {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    return { canvas: this.canvas, ctx: this.ctx };
  }

  async extractTrajectoriesFromImage(imagePath) {
    return new Promise((resolve, reject) => {
      const width = 500;
      const height = 500;
      const { canvas, ctx } = this.initCanvas(width, height);

      const img = canvas.createImage();

      img.onload = () => {
        try {
          canvas.width = img.width || width;
          canvas.height = img.height || height;

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const binaryData = this.preprocessToBlackStrokes(imageData);

          const contours = this.extractContoursFast(binaryData, canvas.width, canvas.height);

          const trajectories = this.contoursToTrajectories(contours, canvas.width, canvas.height);

          const simplifiedTrajectories = trajectories.map(traj => 
            this.simplifyTrajectory(traj, this.options.simplificationTolerance)
          ).filter(traj => traj.points.length >= 2);

          const keyPointTrajectories = simplifiedTrajectories.map(traj =>
            this.extractKeyNodes(traj)
          );

          resolve(keyPointTrajectories);
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => reject(new Error('Image loading failed'));

      img.src = imagePath;
    });
  }

  preprocessToBlackStrokes(imageData) {
    const { data, width, height } = imageData;
    const binary = new Uint8Array(width * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;

        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        const isBlack = r < this.options.blackThreshold &&
                        g < this.options.blackThreshold &&
                        b < this.options.blackThreshold;

        const isDarkEnough = (255 - r) > 200 && (255 - g) > 200 && (255 - b) > 180;

        binary[y * width + x] = (isBlack || isDarkEnough) ? 1 : 0;
      }
    }

    return { data: binary, width, height };
  }

  extractContoursFast(binaryData, width, height) {
    const { data } = binaryData;
    const visited = new Uint8Array(width * height);
    const contours = [];

    const directions = [
      [0, -1], [1, -1], [1, 0], [1, 1],
      [0, 1], [-1, 1], [-1, 0], [-1, -1]
    ];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;

        if (data[idx] === 1 && !visited[idx]) {
          const edgePixels = this.findEdgePixels(x, y, data, width, height, visited);

          if (edgePixels.length > 0) {
            const center = this.calculateCentroid(edgePixels);
            const normalizedPoints = edgePixels.map(p => ({
              x: p.x / width,
              y: p.y / height,
              t: 0
            }));

            contours.push({
              points: normalizedPoints,
              centroid: center,
              pixelCount: edgePixels.length
            });
          }
        }
      }
    }

    return contours;
  }

  findEdgePixels(startX, startY, data, width, height, visited) {
    const edgePixels = [];
    const stack = [[startX, startY]];
    const pixelSet = new Set();
    const maxPixels = 5000;
    let iterations = 0;
    const maxIterations = 100000;

    while (stack.length > 0 && pixelSet.size < maxPixels && iterations < maxIterations) {
      iterations++;
      const [x, y] = stack.pop();
      const idx = y * width + x;

      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      if (data[idx] !== 1) continue;
      if (visited[idx]) continue;

      visited[idx] = 1;
      pixelSet.add(`${x},${y}`);
      edgePixels.push({ x, y });

      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      stack.push([x + 1, y + 1], [x + 1, y - 1], [x - 1, y + 1], [x - 1, y - 1]);
    }

    return edgePixels;
  }

  calculateCentroid(pixels) {
    let sumX = 0, sumY = 0;
    for (const p of pixels) {
      sumX += p.x;
      sumY += p.y;
    }
    return {
      x: sumX / pixels.length,
      y: sumY / pixels.length
    };
  }

  contoursToTrajectories(contours, width, height) {
    return contours
      .filter(c => c.pixelCount >= this.options.minStrokeLength)
      .map(contour => {
        const points = contour.points;

        points.sort((a, b) => a.x - b.x);

        const trajPoints = points.map((p, i) => ({
          x: p.x,
          y: p.y,
          t: i * 10
        }));

        return { points: trajPoints };
      });
  }

  simplifyTrajectory(trajectory, tolerance) {
    if (trajectory.points.length < 3) return trajectory;

    const points = trajectory.points;
    const simplified = [points[0]];
    let lastKept = 0;

    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[lastKept];
      const curr = points[i];
      const next = points[i + 1];

      const angle = this.calculateAngle(prev, curr, next);
      const distance = this.calculateDistance(curr, prev);

      const isSignificant = angle < (180 - this.options.minAngleThreshold) ||
                            distance > tolerance * 2;

      if (isSignificant) {
        simplified.push(curr);
        lastKept = i;
      }
    }

    simplified.push(points[points.length - 1]);
    return { points: simplified };
  }

  extractKeyNodes(trajectory) {
    const points = trajectory.points;
    if (points.length < 3) return trajectory;

    const keyPoints = [points[0]];
    const windowSize = 5;

    for (let i = windowSize; i < points.length - windowSize; i += windowSize) {
      const windowPoints = points.slice(i - windowSize, i + windowSize + 1);

      const centroid = this.calculateCentroidFromPoints(windowPoints);

      let maxDist = 0;
      let keyPoint = windowPoints[Math.floor(windowPoints.length / 2)];

      for (const p of windowPoints) {
        const dist = this.calculateDistance(p, centroid);
        if (dist > maxDist) {
          maxDist = dist;
          keyPoint = p;
        }
      }

      if (maxDist > this.options.simplificationTolerance) {
        const lastKey = keyPoints[keyPoints.length - 1];
        const direction = this.getStrokeDirection(lastKey, keyPoint);

        if (direction !== 'none' || keyPoints.length === 0) {
          keyPoints.push(keyPoint);
        }
      }
    }

    keyPoints.push(points[points.length - 1]);

    return { points: keyPoints };
  }

  calculateCentroidFromPoints(points) {
    let sumX = 0, sumY = 0;
    for (const p of points) {
      sumX += p.x;
      sumY += p.y;
    }
    return {
      x: sumX / points.length,
      y: sumY / points.length
    };
  }

  calculateAngle(p1, p2, p3) {
    const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };

    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

    if (mag1 === 0 || mag2 === 0) return 180;

    const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
    return Math.acos(cosAngle) * (180 / Math.PI);
  }

  calculateDistance(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  getStrokeDirection(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return 'none';

    if (Math.abs(angle) < 20 || Math.abs(angle) > 160) return 'horizontal';
    if (Math.abs(angle - 90) < 20 || Math.abs(angle + 90) < 20) return 'vertical';

    return 'diagonal';
  }

  normalizeTrajectories(trajectories, targetWidth, targetHeight) {
    return trajectories.map(traj => ({
      points: traj.points.map(p => ({
        x: p.x * targetWidth,
        y: p.y * targetHeight,
        t: p.t || 0
      }))
    }));
  }
}

module.exports = { ImageTracker };