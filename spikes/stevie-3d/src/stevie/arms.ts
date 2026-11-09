// The arms the comparison page can show. Each arm module adds itself here.
import type { Arm } from "./arm.js";
import { arm3d } from "./arm3d.js";
import { armSprites } from "./arm-sprites.js";
import { routeArms } from "./arm-routes.js";
import { stubArm } from "./stub.js";
import { arm2d } from "./arm2d.js";

export const ARMS: Arm[] = [stubArm, arm2d, arm3d, armSprites, ...routeArms];
