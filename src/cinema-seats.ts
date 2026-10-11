import * as THREE from 'three';

export interface ScreenBounds { x: number; y: number; width: number; height: number }
const corner = new THREE.Vector3();

/** Test each chair, not its row, against the visible projection in viewport pixels. */
export function seatOverlapsScreen(box: THREE.Box3, roomMatrix: THREE.Matrix4, camera: THREE.PerspectiveCamera,
  screen: ScreenBounds, viewportWidth: number, viewportHeight: number): boolean {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (let index = 0; index < 8; index++) {
    corner.set(index & 1 ? box.max.x : box.min.x, index & 2 ? box.max.y : box.min.y,
      index & 4 ? box.max.z : box.min.z).applyMatrix4(roomMatrix).applyMatrix4(camera.matrixWorldInverse);
    // Chairs at or behind the camera cannot cover the distant screen. Avoid projecting through the near plane.
    if (corner.z >= -camera.near) return false;
    corner.applyMatrix4(camera.projectionMatrix);
    const x = (corner.x + 1) * viewportWidth / 2, y = (1 - corner.y) * viewportHeight / 2;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  const screenLeft = Math.max(0, screen.x), screenTop = Math.max(0, screen.y);
  const screenRight = Math.min(viewportWidth, screen.x + screen.width);
  const screenBottom = Math.min(viewportHeight, screen.y + screen.height);
  return Math.min(right, screenRight) - Math.max(left, screenLeft) > 1
    && Math.min(bottom, screenBottom) - Math.max(top, screenTop) > 1;
}
