import Three from 'three';
import createGrid from './grid-creator';
import convert from 'convert-units';
import {disposeObject} from './three-memory-cleaner';

export function parseData(sceneData, editingActions, catalog) {

  let planData = {};

  planData.sceneGraph = {
    pixelPerUnit: sceneData.pixelPerUnit,
    unit: sceneData.unit,
    layers: {},
    width: sceneData.width,
    height: sceneData.height
  };

  planData.plan = new Three.Object3D();

  sceneData.layers.forEach(layer => {

    planData.sceneGraph.layers[layer.id] = {
      lines: {},
      holes: {},
      areas: {},
      items: {},
      visible: layer.visible,
      altitude: layer.altitude
    };

    // Import lines
    layer.lines.forEach(line => {
      createLine(layer, line, editingActions, catalog, sceneData, planData);
    });

    // Import areas
    layer.areas.forEach(area => {

      area.interactFunction = () => {
        editingActions.selectArea(layer.id, area.id);
      };

      catalog.getElement(area.type).render3D(area, layer).then(area3D => {
        area3D.position.y += layer.altitude;
        planData.plan.add(area3D);
        planData.sceneGraph.layers[layer.id].areas[area.id] = area3D;
        area3D.visible = layer.visible;
      });
    });

    // Import items
    layer.items.forEach(item => {
      createItem(layer, item, editingActions, planData.sceneGraph, catalog, planData.plan, sceneData);
    });
  });

  // Compute bounding box for the plan
  planData.boundingBox = new Three.Box3().setFromObject(planData.plan);

  // Add a grid to the plan
  planData.grid = createGrid(sceneData);

  // Set center of plan in the origin

  if (!isFinite(planData.boundingBox.max.x) || !isFinite(planData.boundingBox.min.x) || !isFinite(planData.boundingBox.max.y) || !isFinite(planData.boundingBox.min.y) || !isFinite(boundingBox.max.z) || !isFinite(boundingBox.min.z)) {
    // The plan is Empty
    planData.boundingBox = new Three.Box3().setFromObject(planData.grid);
  }

  let center = [
    (planData.boundingBox.max.x - planData.boundingBox.min.x) / 2 + planData.boundingBox.min.x,
    (planData.boundingBox.max.y - planData.boundingBox.min.y) / 2 + planData.boundingBox.min.y,
    (planData.boundingBox.max.z - planData.boundingBox.min.z) / 2 + planData.boundingBox.min.z];

  planData.plan.position.x -= center[0];
  planData.plan.position.y -= center[1];
  planData.plan.position.z -= center[2];

  planData.grid.position.x -= center[0];
  planData.grid.position.y -= center[1];
  planData.grid.position.z -= center[2];

  return planData;
}

export function updateScene(planData, sceneData, oldSceneData, diffArray, editingActions, catalog) {

  diffArray.forEach(diff => {


    /* First of all I need to find the object I need to update */
    let modifiedPath = diff.path.split("/");

    if (modifiedPath[1] === "layers") {

      let layer = sceneData[modifiedPath[1]].get(modifiedPath[2]);

      if (modifiedPath.length > 2) {

        switch (diff.op) {
          case 'replace':
            replaceObject(modifiedPath, layer, planData, editingActions, sceneData, oldSceneData, catalog);
            break;
          case 'add':
            addObject(modifiedPath, layer, planData, editingActions, sceneData, oldSceneData, catalog);
            break;
          case 'remove':
            removeObject(modifiedPath, layer, planData, editingActions, sceneData, oldSceneData, catalog);
            break;
        }
      }
    }
  });
  return planData;
}


function replaceObject(modifiedPath, layer, planData, editingActions, sceneData, oldSceneData, catalog) {

  let oldLineObject;
  let newLineData;
  let newLineObject;

  let oldAreaObject;
  let newAreaData;
  let newAreaObject;

  let oldItemObject;
  let newItemData;

  switch (modifiedPath[3]) {
    case "layer":
      break;
    case "vertices":
      break;
    case "holes":
      let newHoleData = layer.holes.get(modifiedPath[4]);
      let lineID = newHoleData.line;
      oldLineObject = planData.sceneGraph.layers[layer.id].lines[lineID];
      newLineData = layer.lines.get(lineID);
      replaceLine(layer, oldLineObject, newLineData, editingActions, planData, layer.visible, catalog, sceneData);
      break;
    case "lines":
      // Now I can replace the wall
      oldLineObject = planData.sceneGraph.layers[layer.id].lines[modifiedPath[4]];
      newLineData = layer.lines.get(modifiedPath[4]);
      newLineObject = replaceLine(layer, oldLineObject, newLineData, editingActions, planData, layer.visible, catalog, sceneData);
      break;
    case "areas":
      oldAreaObject = planData.sceneGraph.layers[layer.id].areas[modifiedPath[4]];
      newAreaData = layer.areas.get(modifiedPath[4]);
      newAreaObject = replaceArea(layer, oldAreaObject, newAreaData, editingActions, planData, layer.visible, catalog);
      break;
    case "items":
      oldItemObject = planData.sceneGraph.layers[layer.id].items[modifiedPath[4]];
      newItemData = layer.items.get(modifiedPath[4]);
      replaceItem(layer, oldItemObject, newItemData, editingActions, planData, catalog, sceneData);
      break;

    case "visible":
      let layerGraph = planData.sceneGraph.layers[layer.id];
      layerGraph.visible = layer.visible;
      for (let lineID in layerGraph.lines) {
        layerGraph.lines[lineID].visible = layer.visible;
      }

      for (let areaID in layerGraph.areas) {
        layerGraph.areas[areaID].visible = layer.visible;
      }
      break;
  }
}

function removeObject(modifiedPath, layer, planData, editingActions, sceneData, oldSceneData, catalog) {

  console.info(modifiedPath);
  let lineID;
  let oldLayer = oldSceneData.layers.get(layer.id);
  switch (modifiedPath[3]) {
    case "holes":
      // Nothing to do
      break;
    case "lines":
      // Here I remove the line with all its holes
      lineID = modifiedPath[4];
      oldLayer.lines.get(lineID).holes.forEach(holeID => {
        removeHole(layer, lineID, holeID, planData);
      });
      removeLine(layer, lineID, planData);
      if (modifiedPath.length > 5) {
        // I removed an hole, so I should add the new line
        // TODO: Add Line Code
      }
      break;
    case "areas":
      break;
    case "items":
      break;
  }
}

function removeHole(layer, lineID, holeToRemoveID, planData) {
  let holeToRemove = planData.sceneGraph.layers[layer.id].holes[holeToRemoveID];
  let line3D = planData.sceneGraph.layers[layer.id].lines[lineID];
  line3D.remove(holeToRemove);
  disposeObject(holeToRemove);
  delete planData.sceneGraph.layers[layer.id].holes[holeToRemoveID];
  holeToRemove = null;

  updateBoundingBox(planData);
}

function removeLine(layer, lineID, planData) {
  let line3D = planData.sceneGraph.layers[layer.id].lines[lineID];
  planData.plan.remove(line3D);
  disposeObject(line3D);
  delete planData.sceneGraph.layers[layer.id].lines[lineID];
  line3D = null;

  updateBoundingBox(planData);
}

function addObject(modifiedPath, layer, planData, editingActions, sceneData, oldSceneData, catalog) {
  console.error("addObject not defined! (", modifiedPath, ")");
}

function createLine(layer, line, editingActions, catalog, scene, planData) {


  line.editingActions = editingActions;

  let vertex0 = layer.vertices.get(line.vertices.get(0));
  let vertex1 = layer.vertices.get(line.vertices.get(1));

  if (vertex0.x > vertex1.x) {
    let app = vertex0;
    vertex0 = vertex1;
    vertex1 = app;
  }

  let wall = catalog.getElement(line.type).render3D(line, layer, scene).then(wall => {

    let distance = Math.sqrt(Math.pow(vertex0.x - vertex1.x, 2) + Math.pow(vertex0.y - vertex1.y, 2));

    let thickness = convert(line.properties.get('thickness').get('length'))
        .from(line.properties.get('thickness').get('unit'))
        .to(scene.unit) * scene.pixelPerUnit;

    line.holes.forEach(holeID => {

      let holeData = layer.holes.get(holeID);

      // Create the hole object:
      let holePromise = catalog.getElement(holeData.type).render3D(holeData, undefined, scene);

      holePromise.then(object => {
        let boundingBox = new Three.Box3().setFromObject(object);
        let center = [
          (boundingBox.max.x - boundingBox.min.x) / 2 + boundingBox.min.x,
          (boundingBox.max.y - boundingBox.min.y) / 2 + boundingBox.min.y,
          (boundingBox.max.z - boundingBox.min.z) / 2 + boundingBox.min.z];

        let holeAltitude = convert(holeData.properties.get('altitude').get('length'))
            .from(holeData.properties.get('altitude').get('unit'))
            .to(scene.unit) * scene.pixelPerUnit;

        let holeHeight = convert(holeData.properties.get('height').get('length'))
            .from(holeData.properties.get('height').get('unit'))
            .to(scene.unit) * scene.pixelPerUnit;

        let coordinates = [
          distance * holeData.offset,
          holeAltitude + holeHeight / 2,
          0];

        object.position.x = coordinates[0] - center[0];
        //coordinates[1] - center[1] put the center of the door at the beginning of the hole
        object.position.y = coordinates[1] - center[1];
        object.position.z = coordinates[2] - center[2];
        wall.add(object);

        planData.sceneGraph.layers[layer.id].holes[holeData.id] = object;

        applyInteract(object, () => {
          return line.editingActions.selectHole(layer.id, holeData.id)
        });
      });
    });

    wall.position.x += vertex0.x;
    wall.position.y += layer.altitude;
    wall.position.z -= vertex0.y;

    wall.visible = layer.visible;

    planData.plan.add(wall);
    planData.sceneGraph.layers[layer.id].lines[line.id] = wall;
  });
}

function replaceLine(layer, oldLineObject, newLineData, editingActions, planData, isVisible, catalog, scene) {

  createLine(layer, newLineData, editingActions, catalog, scene, planData);

  // Now I need to translate object to the original coordinates
  let oldBoundingBox = planData.boundingBox;

  let oldCenter = [
    (oldBoundingBox.max.x - oldBoundingBox.min.x) / 2 + oldBoundingBox.min.x,
    (oldBoundingBox.max.y - oldBoundingBox.min.y) / 2 + oldBoundingBox.min.y,
    (oldBoundingBox.max.z - oldBoundingBox.min.z) / 2 + oldBoundingBox.min.z];

  planData.plan.position.x += oldCenter[0];
  planData.plan.position.y += oldCenter[1];
  planData.plan.position.z += oldCenter[2];

  planData.grid.position.x += oldCenter[0];
  planData.grid.position.y += oldCenter[1];
  planData.grid.position.z += oldCenter[2];

  // I need to remove the old object

  planData.plan.remove(oldLineObject);

  disposeObject(oldLineObject);
  oldLineObject = null;

  let newBoundingBox = new Three.Box3().setFromObject(planData.plan);
  let newCenter = [
    (newBoundingBox.max.x - newBoundingBox.min.x) / 2 + newBoundingBox.min.x,
    (newBoundingBox.max.y - newBoundingBox.min.y) / 2 + newBoundingBox.min.y,
    (newBoundingBox.max.z - newBoundingBox.min.z) / 2 + newBoundingBox.min.z];

  planData.plan.position.x -= newCenter[0];
  planData.plan.position.y -= newCenter[1];
  planData.plan.position.z -= newCenter[2];

  planData.grid.position.x -= newCenter[0];
  planData.grid.position.y -= newCenter[1];
  planData.grid.position.z -= newCenter[2];

  planData.boundingBox = newBoundingBox;
}

function replaceArea(layer, oldAreaObject, newAreaData, editingActions, planData, isVisible, catalog) {

  newAreaData.interactFunction = () => {
    editingActions.selectArea(layer.id, newAreaData.id);
  };

  catalog.getElement(newAreaData.type).render3D(newAreaData, layer).then(newAreaObject => {
    newAreaObject.position.y += layer.altitude;

    // Now I need to translate object to the original coordinates
    let oldBoundingBox = planData.boundingBox;

    let oldCenter = [
      (oldBoundingBox.max.x - oldBoundingBox.min.x) / 2 + oldBoundingBox.min.x,
      (oldBoundingBox.max.y - oldBoundingBox.min.y) / 2 + oldBoundingBox.min.y,
      (oldBoundingBox.max.z - oldBoundingBox.min.z) / 2 + oldBoundingBox.min.z];

    planData.plan.position.x += oldCenter[0];
    planData.plan.position.y += oldCenter[1];
    planData.plan.position.z += oldCenter[2];

    planData.grid.position.x += oldCenter[0];
    planData.grid.position.y += oldCenter[1];
    planData.grid.position.z += oldCenter[2];

    planData.plan.remove(oldAreaObject);
    disposeObject(oldAreaObject);

    planData.plan.add(newAreaObject);

    let newBoundingBox = new Three.Box3().setFromObject(planData.plan);
    let newCenter = [
      (newBoundingBox.max.x - newBoundingBox.min.x) / 2 + newBoundingBox.min.x,
      (newBoundingBox.max.y - newBoundingBox.min.y) / 2 + newBoundingBox.min.y,
      (newBoundingBox.max.z - newBoundingBox.min.z) / 2 + newBoundingBox.min.z];

    planData.plan.position.x -= newCenter[0];
    planData.plan.position.y -= newCenter[1];
    planData.plan.position.z -= newCenter[2];

    planData.grid.position.x -= newCenter[0];
    planData.grid.position.y -= newCenter[1];
    planData.grid.position.z -= newCenter[2];

    newAreaObject.visible = layer.visible;
    planData.sceneGraph.layers[layer.id].areas[newAreaData.id] = newAreaObject;
  });
}

function createItem(layer, item, editingActions, sceneGraph, catalog, plan, scene) {
  let item3DPromise = catalog.getElement(item.type).render3D(item, layer, scene);

  item3DPromise.then(item3D => {

    let pivot = new Three.Object3D();
    pivot.add(item3D);

    pivot.rotation.y = item.rotation * Math.PI / 180;
    pivot.position.x = item.x;
    pivot.position.z -= item.y;

    applyInteract(item3D, () => {
        editingActions.selectItem(layer.id, item.id);
      }
    );

    plan.add(pivot);
    sceneGraph.layers[layer.id].items[item.id] = pivot;

  });
}


function replaceItem(layer, oldItemObject, newItemData, editingActions, planData, catalog, scene) {

  planData.plan.remove(oldItemObject);
  disposeObject(oldItemObject);

  let item3DPromise = catalog.getElement(newItemData.type).render3D(newItemData, layer, scene);

  item3DPromise.then(item3D => {

    let pivot = new Three.Object3D();
    pivot.add(item3D);

    pivot.rotation.y = newItemData.rotation * Math.PI / 180;
    pivot.position.x = newItemData.x;
    pivot.position.z -= newItemData.y;

    applyInteract(item3D, () => {
        editingActions.selectItem(layer.id, newItemData.id);
      }
    );

    planData.plan.add(pivot);
    planData.sceneGraph.layers[layer.id].items[newItemData.id] = pivot;

    // Now I need to translate object to the original coordinates
    let oldBoundingBox = planData.boundingBox;

    let oldCenter = [
      (oldBoundingBox.max.x - oldBoundingBox.min.x) / 2 + oldBoundingBox.min.x,
      (oldBoundingBox.max.y - oldBoundingBox.min.y) / 2 + oldBoundingBox.min.y,
      (oldBoundingBox.max.z - oldBoundingBox.min.z) / 2 + oldBoundingBox.min.z];

    planData.plan.position.x += oldCenter[0];
    planData.plan.position.y += oldCenter[1];
    planData.plan.position.z += oldCenter[2];

    planData.grid.position.x += oldCenter[0];
    planData.grid.position.y += oldCenter[1];
    planData.grid.position.z += oldCenter[2];

    let newBoundingBox = new Three.Box3().setFromObject(planData.plan);
    let newCenter = [
      (newBoundingBox.max.x - newBoundingBox.min.x) / 2 + newBoundingBox.min.x,
      (newBoundingBox.max.y - newBoundingBox.min.y) / 2 + newBoundingBox.min.y,
      (newBoundingBox.max.z - newBoundingBox.min.z) / 2 + newBoundingBox.min.z];

    planData.plan.position.x -= newCenter[0];
    planData.plan.position.y -= newCenter[1];
    planData.plan.position.z -= newCenter[2];

    planData.grid.position.x -= newCenter[0];
    planData.grid.position.y -= newCenter[1];
    planData.grid.position.z -= newCenter[2];

  });
}

// Apply interact function to children of an Object3D
function applyInteract(object, interactFunction) {
  object.traverse(function (child) {
    if (child instanceof Three.Mesh) {
      child.interact = interactFunction;
    }
  });
}

function updateBoundingBox(planData) {
  let newBoundingBox = new Three.Box3().setFromObject(planData.plan);
  let newCenter = [
    (newBoundingBox.max.x - newBoundingBox.min.x) / 2 + newBoundingBox.min.x,
    (newBoundingBox.max.y - newBoundingBox.min.y) / 2 + newBoundingBox.min.y,
    (newBoundingBox.max.z - newBoundingBox.min.z) / 2 + newBoundingBox.min.z];

  planData.plan.position.x -= newCenter[0];
  planData.plan.position.y -= newCenter[1];
  planData.plan.position.z -= newCenter[2];

  planData.grid.position.x -= newCenter[0];
  planData.grid.position.y -= newCenter[1];
  planData.grid.position.z -= newCenter[2];
}
