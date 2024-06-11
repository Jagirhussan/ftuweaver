// @ts-nocheck
import "./style.css";

import {
  Graph,
  RubberBandHandler,
  ConnectionHandler,
  ImageBox,
  MaxToolbar,
  GraphDataModel,
  KeyHandler,
  UndoManager,
  Cell,
  Geometry,
  InternalEvent,
  Shape,
  styleUtils,
  gestureUtils,
  ConnectionConstraint,
  Point,
  EventObject,
  Client,
  constants,
  CellRenderer,
  ChildChange,
  CodecRegistry,
  Geometry,
  Point,
  ObjectCodec,
  Codec,
} from "@maxgraph/core";

import { PHSLatexGenerator, JSONViewer } from "./components";

import { loadPyodide } from "pyodide";

import { DataTable, convertJSON, makeEditable } from "simple-datatables";

import { Marked } from "@ts-stack/markdown";

import Delaunator from 'delaunator';

// Color picker
import Picker from "vanilla-picker/csp";
import "vanilla-picker/dist/vanilla-picker.csp.css";

const pyth = (el) => {
  for (const node of el.children) {
    const s = node.innerText
      .replace(/(\/\/.*)/g, "<em>$1</em>")
      .replace(
        /\b(if|else|while|for|in|of|continue|break|return|typeof|def|class|\.length|\.\w+)(?=[^\w])/g,
        "<strong>$1</strong>"
      )
      .replace(/(".*?"|'.*?'|`.*?`)/g, "<strong><em>$1</em></strong>")
      .replace(/\b(\d+)/g, "<em><strong>$1</strong></em>");
    node.innerHTML = s.split("\n").join("<br/>");
  }
};

const editor = (el, highlight = pyth, tab = "    ") => {
  const caret = () => {
    const range = window.getSelection().getRangeAt(0);
    const prefix = range.cloneRange();
    prefix.selectNodeContents(el);
    prefix.setEnd(range.endContainer, range.endOffset);
    return prefix.toString().length;
  };

  const setCaret = (pos, parent = el) => {
    for (const node of parent.childNodes) {
      if (node.nodeType == Node.TEXT_NODE) {
        if (node.length >= pos) {
          const range = document.createRange();
          const sel = window.getSelection();
          range.setStart(node, pos);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
          return -1;
        } else {
          pos = pos - node.length;
        }
      } else {
        pos = setCaret(pos, node);
        if (pos < 0) {
          return pos;
        }
      }
    }
    return pos;
  };

  highlight(el);

  el.addEventListener("keydown", (e) => {
    if (e.which === 9) {
      const pos = caret() + tab.length;
      const range = window.getSelection().getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(tab));
      highlight(el);
      setCaret(pos);
      e.preventDefault();
    }
  });

  el.addEventListener("keyup", (e) => {
    if (e.keyCode >= 0x30 || e.keyCode == 0x20) {
      const pos = caret();
      highlight(el);
      setCaret(pos);
    }
  });
};

//Datastructures for the Logic handling HTML <-> javascript

var currentFTUElement: string = "";
var vertexPrototypes = Object();
var provenance = Object();
var documentChanged: boolean = false;
const font_size = 14;

var model: GraphDataModel = null;
var graph: Graph = null;

var tbContainer = null;
var mxConnectionHandlerInsertEdge = null;
var connectionHandler = null;

var graphNodes = Object();
var graphEdges = Object();
var rows = 0;
var cols = 0;
var withBoundary = false;
var currentNodeOffset = 0;
var edgeCounter = 1;
var boundaryNetworkID = -1;
var usedOffsets = [0.0, 0.0];
var showEdgeLabels = true;
var activePHSwindowUpdated = false;
var phsLatexGen = null;
var activePHSwindow = null;
var activephsclasses = Object();
var phsClassColor = Object();
var activeNetworks = Object();
var networkData = Object();
var compositionErrors = Object();
var displayActiveNetworkDataTable = null;
var displayActiveNetworkDataTableEditor = null;

var configureActiveNetworksDataTable = null;
var configureActiveNetworksDataTableEditor = null;

var propTab = null;
var anotTab = null;
var editorTab = null;
var phsCompositionTab = null;
var symbolicPHSTab = null;
var pythonicPHSTab = null;
var pythonoutput = null;
var pythoncode = null;
var pythonloaded = false;
var createphsparameterdatatable = null;
var workflowdesc = "";

function updatePropertiesBar(cell, ignorecurrent = false) {
  if (!ignorecurrent && cell != null && cell.id == currentFTUElement) return;
  const nameElement = document.getElementById("currentElementName");
  if (cell != null) {
    document.getElementById("propTable").innerHTML = "";
    if (!("value" in cell)) {
      return; //Background image decorator
    }
    if (cell.value == null) {
      return;
    }
    if (!cell.isEdge()) {
      document.getElementById("selectednodes").value = cell.value["label"];
      if ("phs" in cell.value) {
        document.getElementById("currentElementPHSclass").innerHTML =
          cell.value["phs"];
      } else {
        if (cell.value["type"] == "in")
          document.getElementById("currentElementPHSclass").innerHTML =
            "Not assigned";
        else document.getElementById("currentElementPHSclass").innerHTML = "";
      }
      if (cell.value["type"] == "in")
        document.getElementById("phsclasslabel").style.display = "block";
      else document.getElementById("phsclasslabel").style.display = "none";
    } else {
      document.getElementById("phsclasslabel").style.display = "none";
      document.getElementById("currentElementPHSclass").innerHTML = "";
      //Setup weights
      if ("weight" in cell.value) {
        let wr = `<b>Assigned Network</b><br><table style="width:100%"><tr><th>ID</th><th>Name</th><th>Weight</th><tr>`;
        for (let k in cell.value["weight"]) {
          wr += `<tr><td align="center">${k}</td><td>${activeNetworks[k].name}</td><td align="center">${cell.value["weight"][k]}</td></tr>`;
        }
        wr += `</table>`;
        document.getElementById("propTable").innerHTML = wr;
      }
    }
    nameElement.innerHTML = cell.value["label"];
    currentFTUElement = cell.id;
    document.getElementById("PropertiesContent").style.display = "block";
    document.getElementById("colorpickerparent").style.background =
      cell.style.fillColor;
    document.getElementById("colorpickerparent").style.display = "block";
  } else {
    currentFTUElement = "";
    nameElement.innerHTML = "";
    document.getElementById("PropertiesContent").style.display = "none";
    document.getElementById("colorpickerparent").style.display = "none";
  }
  //Ensure the toolbar container is not diabled
  graph.container.focus();
}

function getPHSData() {
  let phsdata = Object();
  const phsrows = document.getElementById("phslist").rows;
  //No header so start at 0
  for (var j = 0, jLen = phsrows.length; j < jLen; j++) {
    const phs = JSON.parse(phsrows[j].cells[0].children[0].dataset.init);
    phsdata[phsrows[j].cells[0].children[0].id] = {
      phs: phs,
      color: phsrows[j].cells[0].children[0].style.background,
    };
  }
  return phsdata;
}

function showStatusMessage(msg,msgtimeout=1000){
  document.getElementById("statusbar").innerHTML = msg;
  setTimeout(function () {
    document.getElementById("statusbar").innerHTML = "";
  }, msgtimeout);
}



function saveModel() {
  try {
    let result = Object();
    document.body.style.cursor = "progress";
    showProgressPopup();
    result["Provenance"] = provenance;
    const cells = graph.model.cells;
    let gnodes = [];
    let gedges = [];
    let bgimages = [];
    for (const c in cells) {
      if (cells[c].isVertex()) {
        if ("value" in cells[c] && cells[c].value != null) {
          let v = { id: cells[c].id };
          v["style"] = cells[c].style;
          v["geometry"] = cells[c].geometry;
          v["value"] = cells[c].value;
          gnodes.push(v);
        } else {
          //Handle background image
          let v = { id: cells[c].id };
          v["style"] = cells[c].style;
          v["geometry"] = cells[c].geometry;
          bgimages.push(v);
        }
      } else if (cells[c].isEdge()) {
        let v = { id: cells[c].id };
        v["style"] = cells[c].style;
        v["geometry"] = cells[c].geometry;
        v["value"] = cells[c].value;
        v["source"] = parseInt(cells[c].source.value.label);
        v["target"] = parseInt(cells[c].target.value.label);
        gedges.push(v);
      }
    }
    result["graph"] = { nodes: gnodes, edges: gedges, bgimages: bgimages };
    //This is done by save composition
    //Save phs, network and other information
    const phsdata = getPHSData();
    result["phsdata"] = phsdata;
    for(const [k,v] of Object.entries(activeNetworks)){
      const key = parseInt(k,10);
      if(key in networkData){
        networkData[key]['isdissipative'] = v.dissipative;
        networkData[key]['name'] = v.name;
        networkData[key]['type'] = v.type;
      }else{
        networkData[key] = {'isdissipative':v.dissipative, 'name':v.name, 'type': v.type};
      }
    }

    result["networkdata"] = networkData;
    result["currentNodeOffset"] = currentNodeOffset;
    result["edgeCounter"] = edgeCounter;
    result["boundaryNetworkID"] = boundaryNetworkID;
    result["usedOffsets"] = usedOffsets;
    result["showEdgeLabels"] = showEdgeLabels;

    return JSON.stringify(result);
  } catch (e) {
    alert("Failed to save model!");
    console.log(e);
  } finally {
    document.body.style.cursor = "default";
  }
}

function loadModel(ctex: string) {
  let inputData = JSON.parse(ctex);
  if ("composition" in inputData) {
    inputData = inputData["graph"];
    document.getElementById("composedPHS").innerText =
      JSON.stringify(inputData);
    document.getElementById("compositePHS").innerHTML = "Loaded!";
    document.getElementById("symbolicphscodeblock").style.display = "block";
    if(document.getElementById("composedPHSPython").value.length>0){
      document.getElementById("pythonicphscodeblock").style.display = "block";    
    }else{
      document.getElementById("pythonicphscodeblock").style.display = "none";    
    }
  } else {
    document.getElementById("composedPHS").innerText = "";
    document.getElementById("composedPHSPython").innerText = "";
    document.getElementById("compositePHS").innerHTML = "";
    document.getElementById("symbolicphscodeblock").style.display = "none";
    document.getElementById("pythonicphscodeblock").style.display = "none";
  }

  provenance = inputData["Provenance"];
  document.getElementById("projectnameheader").innerHTML =
    "<b>Project Name: " + provenance["projectname"] + "</b>";

  const g = inputData["graph"];
  //Create the nodes
  const gnodes = inputData["graph"]["nodes"];
  const gedges = inputData["graph"]["edges"];

  const parent = graph.getDefaultParent();
  graphNodes = {};
  graphEdges = {};
  activeNetworks = {};
  networkData = {};
  let labelidmap = {};
  graph.stopEditing(false);
  if ("bgimages" in inputData["graph"]) {
    const bgimages = inputData["graph"]["bgimages"];
    for (let i = 0; i < bgimages.length; i++) {
      const nd = bgimages[i];
      let gn = graph.insertVertex({
        parent,
        id: nd.id,
        x: nd.geometry._x,
        y: nd.geometry._y,
        width: nd.geometry._width,
        height: nd.geometry._height,
        style: nd.style,
      });
    }
  }
  for (let i = 0; i < gnodes.length; i++) {
    const nd = gnodes[i];
    let gn = graph.insertVertex({
      parent,
      id: nd.id,
      value: nd.value,
      x: nd.geometry._x,
      y: nd.geometry._y,
      width: nd.geometry._width,
      height: nd.geometry._height,
      style: nd.style,
    });
    gn.style = nd.style;
    graphNodes[gn.value.label] = gn;
    labelidmap[nd.id] = gn.value.label;
  }
  for (let i = 0; i < gedges.length; i++) {
    const ed = gedges[i];
    let ede = graph.insertEdge(
      parent,
      ed.id,
      ed.value,
      graphNodes[ed.source],
      graphNodes[ed.target],
      ed.style
    );
    ede.geometry.x = ed.geometry._x;
    ede.geometry.y = ed.geometry._y;
    if (ed.geometry.offset != null)
      ede.geometry.offset = new Point(
        ed.geometry.offset._x,
        ed.geometry.offset._y
      );

    if (ed.geometry.points != null) {
      ede.geometry.points = Array();
      for (let i = 0; i < ed.geometry.points.length; i++) {
        const pt = ed.geometry.points[i];
        ede.geometry.points.push(new Point(pt._x, pt._y));
      }
      //Required to ensure shape is rendered
      graph.refresh(ede);
    }
    graphEdges[parseInt(ed.value["label"], 10)] = ede;
    for (const n in ed.value["weight"]) {
      const nid = parseInt(ed.value["label"], 10);
      if (n in activeNetworks) {
        activeNetworks[parseInt(n, 10)]["edges"].push(nid);
      } else {
        activeNetworks[parseInt(n, 10)] = {
          type: ed.value["type"] == "out" ? "boundary" : "generic",
          name: ed.value["type"] == "out" ? "Bdry Net "+(-parseInt(n, 10)) : "Network "+parseInt(n, 10),
          edges: [nid],
          id: parseInt(n,10),
          dissipative: false
        };
      }
    }
  }
  graph.stopEditing(true);
  //Load phs entries
  //clear the phs class selection datalists
  document.getElementById("phslist").innerHTML = "";

  for (const e in inputData["phsdata"]) {
    const jsonObj = inputData["phsdata"][e];
    loadPHSTable(e, jsonObj["phs"], null, jsonObj["color"]);
  }
  //Load networks
  networkData = {};
  for (const nid in inputData["networkdata"]) {
    let ndata = inputData["networkdata"][nid];
    if (typeof ndata === "string") ndata = JSON.parse(ndata);
    const pnid = parseInt(nid, 10);//parseInt(nid.substring(7), 10);
    //Update active networkdata
    activeNetworks[pnid].dissipative = ndata["isdissipative"];
    if('name' in ndata){
      activeNetworks[pnid].name = ndata['name'];
    }
    networkData[pnid] = ndata;
  }
  resetDisplayActiveNetworkDataTable();
  reloadDisplayActiveNetworkDataTable();

  currentNodeOffset = inputData["currentNodeOffset"];
  edgeCounter = inputData["edgeCounter"];
  boundaryNetworkID = inputData["boundaryNetworkID"];
  usedOffsets = inputData["usedOffsets"];
  showEdgeLabels = inputData["showEdgeLabels"];
}

function saveTextArea(filename: string, elementid: string) {
  if (filename != null) {
    // It works on all HTML5 Ready browsers as it uses the download attribute of the <a> element:
    const element = document.createElement("a");
    let content = document.getElementById(elementid).value;

    //A blob is a data type that can store binary data
    // "type" is a MIME type
    // It can have a different value, based on a file you want to save
    const blob = new Blob([content], {
      type: "plain/text",
    });
    //createObjectURL() static method creates a DOMString containing a URL representing the object given in the parameter.
    const fileUrl = URL.createObjectURL(blob);

    //setAttribute() Sets the value of an attribute on the specified element.
    element.setAttribute("href", fileUrl); //file location
    element.setAttribute("download", filename); // file name
    element.style.display = "none";

    //use appendChild() method to move an element from one element to another
    document.body.appendChild(element);
    element.click();

    //The removeChild() method of the Node interface removes a child node from the DOM and returns the removed node
    document.body.removeChild(element);
  }
}

function selectCells(nodes = true) {
  if (nodes) {
    const cursel = document.getElementById("selectednodes").value.trim();
    if (cursel.length != 0) {
      let nds = cursel.split(",");
      let nodes = [];
      for (let v = 0; v < nds.length; v++) {
        const ni = parseInt(nds[v], 10);
        nodes.push(graphNodes[ni]);
      }
      graph.clearSelection();
      graph.setSelectionCells(nodes);
    }
  } else {
    const curedges = document.getElementById("selectededges").value.trim();
    if (curedges.length != 0) {
      let nds = curedges.split(",");
      let edges = [];
      for (let v = 0; v < nds.length; v++) {
        const ni = parseInt(nds[v], 10);
        edges.push(graphEdges[ni]);
      }
      graph.clearSelection();
      graph.setSelectionCells(edges);
    }
  }
}

function openTab(tabName: string) {
  if(tabName=="ProceduralEditor"){
    if(!pythonloaded){
      document.getElementById("apiEditor").style.backgroundColor = "lightgray";
      alert("Python modules have not finished loading. Wait and retry!");
      return false;
    }
  }
  //Color the buttons
  var bx = document.getElementsByClassName("w3-button");
  for (let j = 0; j < bx.length; j++) {
    bx[j].style.backgroundColor = "lightgray";
  }
  const tbs = document.getElementsByClassName("w3-tab");
  for (let j = 0; j < tbs.length; j++) {
    tbs[j].style.display = "none";
  }
  if (propTab == null || editorTab == null || symbolicPHSTab == null || pythonicPHSTab == null) {
    for (let j = 0; j < tbs.length; j++) {
      if (tbs[j].id == "Properties") {
        //this is the div
        propTab = tbs[j];
      } else if (tbs[j].id == "Composition") {
        phsCompositionTab = tbs[j];
      } else if (tbs[j].id == "GraphicalEditor") {
        editorTab = tbs[j];
      } else if (tbs[j].id == "SymbolicPHS") {
        symbolicPHSTab = tbs[j];
      } else if (tbs[j].id == "PythonicPHS") {
        pythonicPHSTab = tbs[j];
      }      
    }
  }
  if (tabName == "GraphicalEditor") {
    propTab.style.display = "block";
    editorTab.style.display = "block";
    updateActivePHSInstance();
  } else if (tabName == "Properties") {
    propTab.style.display = "block";
    editorTab.style.display = "block";
  } else if (tabName == "Composition") {
    symbolicPHSTab.style.display = "block";
    pythonicPHSTab.style.display = "none";
    phsCompositionTab.style.display = "block";
    //Composition's button color will be made gray after this call
    //Set the color for Symbolic PHS button
    document.getElementById("symbolicphsbutton").style.background = 'gray';
  } else if (tabName == "SymbolicPHS") {
    phsCompositionTab.style.display = "block";
    symbolicPHSTab.style.display = "block";
    pythonicPHSTab.style.display = "none";
    //SymbolicPHS button will be set to gray, while composition will be lightgray    
    document.getElementById("ftuComposition").style.background = 'gray';    
  } else if (tabName == "PythonicPHS") {
    phsCompositionTab.style.display = "block";
    symbolicPHSTab.style.display = "none";
    pythonicPHSTab.style.display = "block";
    //PythonicPHS button will be set to gray, while composition will be lightgray
    document.getElementById("ftuComposition").style.background = 'gray';
  } else {
    document.getElementById(tabName).style.display = "block";
    updateActivePHSInstance();
  }
  return true;
}

function updateActivePHSInstance() {
  if (activePHSwindow != null && !activePHSwindowUpdated) {
    //Check if data has changed and if so update
    const table = document.getElementById("phsparametervalues");
    let inst = JSON.parse(
      document.getElementById(activePHSwindow).dataset.init
    );
    let phsv = {}
    if("parameter_values" in inst["phs"]){
      phsv = inst["phs"]["parameter_values"];
      //Update only if value has changed.
      for (let i = 1, row; (row = table.rows[i]); i++) {
        if (row.cells[1].dataset.init != row.cells[1].innerText.trim()) {
          phsv[row.cells[1].dataset.key] = {"value":row.cells[1].innerText.trim(),"units":row.cells[2].innerText.trim()};
        }
      }
    }else{
      for (let i = 1, row; (row = table.rows[i]); i++) {
          phsv[row.cells[1].dataset.key] = {"value":row.cells[1].innerText.trim(),"units":row.cells[2].innerText.trim()};
      }
    }
    inst["phs"]["parameter_values"] = phsv;

    const svtable = document.getElementById("phsstateinitialvalues");
    let phssv = {};
    if("state_values" in inst["phs"]){
      phssv = inst["phs"]["state_values"];
      for (let i = 1, row; (row = svtable.rows[i]); i++) {
        if (row.cells[1].dataset.init != row.cells[1].innerText.trim()) {
          phssv[row.cells[1].dataset.key] = {"value":row.cells[1].innerText.trim(),"units":row.cells[2].innerText.trim()};
        }
      }  
    }else{
      for (let i = 1, row; (row = svtable.rows[i]); i++) {
          phssv[row.cells[1].dataset.key] = {"value":row.cells[1].innerText.trim(),"units":row.cells[2].innerText.trim()};
      }        
    }
    inst["phs"]["state_values"] = phssv;

    if ("u_split" in inst["phs"]["portHamiltonianMatrices"]) {
      let up = inst["phs"]["portHamiltonianMatrices"]["u_split"]["elements"];
      const utable = document.getElementById("upotentialtypes");
      //Ignore first row as it is header
      for (let i = 1, row; (row = utable.rows[i]); i++) {
        let di = row.cells[2].dataset.init;
        let cv = row.cells[2].children[0].value;
        if (!(parseInt(cv, 10) in activeNetworks)) {
          //alert("Network "+cv+" is not defined.\nComposing FTU may fail if it remains undefined.")
          showStatusMessage("Network " +
          activeNetworks[cv].name +
          " is not defined. Composing FTU may fail if it remains undefined.",500);
        }
        if (di != cv) {
          up[row.cells[2].dataset.key] = parseInt(cv, 10);
        }
      }
      inst["phs"]["portHamiltonianMatrices"]["u_split"]["elements"] = up;
    }else{ //Logic when potential types are used
      const utable = document.getElementById("upotentialtypes");
      let ut = {"cols":1}
      let elems = [];
      let udefined = true;
      for (let i = 1, row; row = utable.rows[i]; i++) {
          let cv = parseInt(row.cells[2].children[0].value,10);
          if(!(cv in activeNetworks)){
             showStatusMessage(activePHSwindow +"'s component "+row.cells[0].textContent+" does not have a network assigned. Composing FTU may fail if it remains undefined.",20000)
          }
          elems.push(cv);
          if(cv==null||isNaN(cv)){
            udefined = false;
          }
      }
      if(udefined){
        ut['elements'] = elems;
        ut['rows'] = elems.length;
        inst['phs']['portHamiltonianMatrices']['u_split'] = ut;
      }
    }
    //Update boundary connections
    if ("u_connect2boundary" in inst["phs"]["portHamiltonianMatrices"]) {
      let up =
        inst["phs"]["portHamiltonianMatrices"]["u_connect2boundary"][
          "elements"
        ];
      const utable = document.getElementById("upotentialtypes");
      //Ignore first row as it is header
      for (let i = 1, row; (row = utable.rows[i]); i++) {
        let di = row.cells[3].dataset.init == "true" ? true : false;
        let cv = row.cells[3].children[0].checked;
        if (di != cv) {
          up[row.cells[3].dataset.key] = cv;
        }
      }
      inst["phs"]["portHamiltonianMatrices"]["u_connect2boundary"]["elements"] =
        up;
    } else {
      const utable = document.getElementById("upotentialtypes");
      let ut = { cols: 1 };
      let elems = [];
      for (let i = 1, row; (row = utable.rows[i]); i++) {
        let cv = row.cells[3].children[0].checked;
        elems.push(cv);
      }
      ut["elements"] = elems;
      ut["rows"] = elems.length;
      inst["phs"]["portHamiltonianMatrices"]["u_connect2boundary"] = ut;
    }

    document.getElementById(activePHSwindow).dataset.init =
      JSON.stringify(inst);
    activePHSwindowUpdated = true;
  }
}

function savephsinstance(elemid) {
  let phsname = elemid.id.substring(0, elemid.id.length - 5);
  updateActivePHSInstance();
  //BG data
  activePHSwindow = phsname;
  const res = document.getElementById(activePHSwindow).dataset.init;
  let phsjson = JSON.parse(res);
  if (phsjson.success || "phs" in phsjson) {
    //Create an anchor element
    const element = document.createElement("a");

    //A blob is a data type that can store binary data
    // "type" is a MIME type
    // It can have a different value, based on a file you want to save
    const blob = new Blob([res], {
      type: "plain/text",
    });
    //createObjectURL() static method creates a DOMString containing a URL representing the object given in the parameter.
    const fileUrl = URL.createObjectURL(blob);

    //setAttribute() Sets the value of an attribute on the specified element.
    element.setAttribute("href", fileUrl); //file location
    element.setAttribute("download", activePHSwindow + "_phs_json.json"); // file name
    element.style.display = "none";

    //use appendChild() method to move an element from one element to another
    document.body.appendChild(element);
    element.click();

    //The removeChild() method of the Node interface removes a child node from the DOM and returns the removed node
    document.body.removeChild(element);
  }
}

function showphsinstance(elemid) {
  if (activePHSwindow == elemid.id) return;
  updateActivePHSInstance();
  //BG data
  activePHSwindow = elemid.id;
  activePHSwindowUpdated = false;
  const res = elemid.dataset.init;
  let phsjson = JSON.parse(res);
  if (phsjson.success || "phs" in phsjson) {
    const phsObject = phsjson["phs"];
    if (phsObject != null) {
      let success = phsLatexGen.generate(phsObject, provenance);
      if (success) {
        typesetCompositePHS("phsMathML");
      }
      document.getElementById("phsinstancename").innerHTML =
        activePHSwindow.replaceAll("_", " ");
      document.getElementById("updatePHSInstance").style.display = "block";
      document.getElementById("savePHSInstanceToFile").style.display = "block";
    }
  } else {
    document.getElementById("phsMathML").innerHTML = "";
    document.getElementById("phsinstancename").innerHTML = "";
    document.getElementById("updatePHSInstance").style.display = "none";
    document.getElementById("savePHSInstanceToFile").style.display = "none";
    activePHSwindow = null;
  }
}

function duplicatephsinstance(elemid) {
  //Duplication is used to handle situations where
  //Some PHS io can be split and used among different networks
  //or have different parameter values
  const parentid = elemid.dataset.init;
  let newName = prompt(
    "Please enter phs name:",
    parentid.replaceAll("_", " ") + " copy"
  );
  if (newName != null || newName != "") {
    //Save current to current
    updateActivePHSInstance();
    phscolorpickerparent.style.background = generateColor();
    activePHSwindowUpdated = false;
    const numRows = document.getElementById("phslist").rows.length;
    let irow = document.getElementById("phslist").insertRow(-1);
    var cs = irow.insertCell(-1);
    const fname = newName;
    const res = document.getElementById(parentid).dataset.init;
    const file = document.getElementById(parentid + "-delete").dataset.init;
    activephsclasses[fname] = JSON.parse(res);
    cs.innerHTML = `<button class="phsinstance" id="${fname}" data-init='${res}' style="width:100%; white-space: normal; word-wrap: break-word; background: ${
      phscolorpickerparent.style.background
    }">${fname.replaceAll("_", " ")}</button>`;
    cs = irow.insertCell(-1);
    // cs.innerHTML = `<button class="phssave" id="${fname}-save" data-row="${numRows}" data-init='${res}' style="background: ${phscolorpickerparent.style.background}">Save</button>`;
    // cs = irow.insertCell(-1);
    cs.innerHTML = `<button class="phsduplicate" id="${fname}-duplicate" data-init="${fname}" style="background: ${phscolorpickerparent.style.background}">Duplicate</button>`;
    cs = irow.insertCell(-1);
    cs.innerHTML = `<button class="phsdelete" id="${fname}-delete" data-row="${numRows}" data-init="${file}" style="background: ${phscolorpickerparent.style.background}">X</button>`;
    activePHSwindow = fname;
    phsClassColor[fname] = phscolorpickerparent.style.background;
    document.getElementById("phsinstancename").innerHTML =
      activePHSwindow.replaceAll("_", " ");
  }
}

function deletephsinstance(elemid) {
  let irow = elemid.parentNode.parentNode;
  irow.parentNode.removeChild(irow);
  document.getElementById("phsMathML").innerHTML = "";
  document.getElementById("phsinstancename").innerHTML = "";
  document.getElementById("updatePHSInstance").style.display = "none";
  document.getElementById("savePHSInstanceToFile").style.display = "none";
  activePHSwindowUpdated = false;
  activePHSwindow = null;
  delete activephsclasses[elemid.id];
}

function createToolBarGroup(groupName, show = false) {
  const grpBtn = document.createElement("button");
  grpBtn.className = "accordian";
  grpBtn.value = groupName;
  grpBtn.innerHTML = `<b>${groupName}</b>`;
  grpBtn.style.width = "90%";
  grpBtn.style.marginLeft = "10px";
  grpBtn.style.border = "none";
  grpBtn.style.outline = "none";
  const grpPanel = document.createElement("div");
  grpPanel.className = "panel";

  if (show == true) {
    grpBtn.className = "accordian active";
    grpPanel.style.display = "block";
  } else {
    grpPanel.style.display = "none";
  }

  tbContainer.appendChild(grpBtn);
  tbContainer.appendChild(grpPanel);

  grpBtn.addEventListener("click", function () {
    this.classList.toggle("active");
    var panel = this.nextElementSibling;
    if (panel.style.display === "block") {
      panel.style.display = "none";
    } else {
      panel.style.display = "block";
    }
  });

  return grpPanel;
}

function generateColor() {
  const hexArray = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, "A", "B", "C", "D", "E", "F"];
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += hexArray[Math.floor(Math.random() * 16)];
  }
  return `#${code}`;
}

function setNetworkComponents() {
  activePHSwindowUpdated = false;
  if (document.getElementById("boundarynetworkdef").style.display == "block") {
    const networkid = document.getElementById("networkid").innerHTML.trim();
    if (networkid.length == 0) return;
    const phsclass = document.getElementById("networkphsclassselection").innerText;
    const utable = document.getElementById("networkphsclassinputunames").rows;
    let definedcomponents = [];
    for (var j = 0, jLen = utable.length; j < jLen; j++) {
      definedcomponents.push(utable[j].cells[0].children[0].checked);
    }

    const nid = document.getElementById("networkid").dataset.init;
    const nids = nid.split(",");
    for(let i=0;i<nids.length;i++){
      const id = parseInt(nids[i],10);
      if(id in networkData){
        networkData[id]["input"] = {
          phsclass: phsclass,
          components: definedcomponents,
        };
      }else{
        networkData[id] = {"name": activeNetworks[id]["name"], "isdissipative": activeNetworks[id]["dissipative"], "type": activeNetworks[id]["type"], "input":{
          phsclass: phsclass,
          components: definedcomponents,
        }}
      }
    }
  }
}

function updateNetwork(nid, eids) {
  if (!(nid in activeNetworks) && !("" + nid in activeNetworks)) {
    //Add to the top of the list
    const pnid = nid; //parseInt(nid.substring(7),10);
    // traverse through edge nodes and check boundary
    let isboundary = false;
    for(let i=0;i<eids.length;i++){
      if(graphEdges[eids[i]].value['type']=="out"){
        isboundary=true;
        break;
      }
    }
    let blabel = isboundary? "Bdry Net " + pnid:"Network " + pnid;
    if (pnid < 0) {
      blabel = "Bdry Net " + -pnid;
    }
    activeNetworks[pnid] = {
      type: isboundary ? "boundary" : "generic",
      name: blabel,
      edges: eids,
      id: pnid,
      dissipative: false
    };
    //Update display datatable
    let newData = {
      headings : ["Type","Edges","Name","ID","Dissipative?","Select"],
      data : [[activeNetworks[pnid].type,activeNetworks[pnid].edges,activeNetworks[pnid].name,activeNetworks[pnid].id,activeNetworks[pnid].dissipative,false]]
    }
    displayActiveNetworkDataTable.insert(newData);  
    configureActiveNetworksDataTable.insert(newData); 
    displayActiveNetworkDataTable.refresh();
    configureActiveNetworksDataTable.refresh();

  }
}

function loadPHSTable(fname, jsonObj, jsonstr = null, color = null) {
  let phsObject = null;
  let res = null;
  if ("phs" in jsonObj){
    res = JSON.stringify(jsonObj);
    phsObject = jsonObj["phs"];
  } else {
    //Get phs for the bg project
    res = BondGraphModule.generatePortHamiltonian(jsonstr);
    let phsjson = JSON.parse(res);
    if (phsjson.success) {
      phsObject = phsjson["phs"];
    }
  }
  if (phsObject != null) {
    let success = phsLatexGen.generate(phsObject, provenance);
    if (success) {
      typesetCompositePHS("phsMathML");

      let numRows = document.getElementById("phslist").rows.length;
      let irow = document.getElementById("phslist").insertRow(-1);
      var cs = irow.insertCell(-1);
      activephsclasses[fname] = JSON.parse(res);
      cs.innerHTML = `<button class="phsinstance" id="${fname}" data-init='${res}' style="width:100%; white-space: normal; word-wrap: break-word; background: ${
        phscolorpickerparent.style.background
      }">${fname.replaceAll("_", " ")}</button>`;
      cs = irow.insertCell(-1);
      // cs.innerHTML = `<button class="phssave" id="${fname}-save" data-row="${numRows}" data-init='${res}' style="background: ${phscolorpickerparent.style.background}">Save</button>`;
      // cs = irow.insertCell(-1);
      cs.innerHTML = `<button class="phsduplicate" id="${fname}-duplicate" data-init="${fname}" style="background: ${phscolorpickerparent.style.background}">Duplicate</button>`;
      cs = irow.insertCell(-1);
      cs.innerHTML = `<button class="phsdelete" id="${fname}-delete" data-row="${numRows}" data-init="${fname}" style="background: ${phscolorpickerparent.style.background}">X</button>`;
      activePHSwindow = fname;
      if (color == null) {
        phsClassColor[fname] = phscolorpickerparent.style.background;
      } else {
        phsClassColor[fname] = color;
      }

      document.getElementById("phsinstancename").innerHTML =
        activePHSwindow.replaceAll("_", " ");
      document.getElementById("updatePHSInstance").style.display = "block";
      document.getElementById("savePHSInstanceToFile").style.display = "block";
      activePHSwindowUpdated = false;
    }
  } else {
    activePHSwindow = null;
    alert(
      "Failed to parse selected file.\nOnly Bondgraph json or PHS json files are supported."
    );
  }
}

function getUComponentLinkages(node, u, usplit, noden, y, ysplit, networkdata) {
  //Check if network ids match
  //If there is more than one match, go with name match
  let match = {};
  for (const s in u) {
    const srcu = u[s];
    const srcn = usplit[s];
    if (srcn == null) {
      alert(
        "Network input component assignment is incomplete! Affected PHS" +
          noden.value["phs"]
      );
      return match;
    }
    let dissipativeType = false;
    if (!(srcn in networkdata)) {
      alert("Network data for network " + srcn + " not found!!");
      return match;
    }
    if ("isdissipative" in networkdata[srcn]) {
      dissipativeType = networkdata[srcn]["isdissipative"];
    }

    let ncount = 0;
    for (const k in ysplit) {
      if (srcn == ysplit[k]) {
        ncount += 1;
      }
    }
    if (ncount > 1) {
      //match by name
      ncount = 0;
      for (const k in ysplit) {
        if (y[k] == srcu) {
          ncount = 1;
          if (srcu in match) {
            match[srcu].push({
              name: y[k],
              sindx: parseInt(s, 10),
              tidx: parseInt(k, 10),
              dissipative: dissipativeType,
              source: node.value["label"],
              target: noden.value["label"],
            });
          } else {
            match[srcu] = [
              {
                name: y[k],
                sindx: parseInt(s, 10),
                tidx: parseInt(k, 10),
                dissipative: dissipativeType,
                source: node.value["label"],
                target: noden.value["label"],
              },
            ];
          }
        }
      }
      //No match found - report error
      if (ncount == 0) {
        if (node in compositionErrors) {
          compositionErrors[node]["missinglinks"].push(srcu);
        } else {
          compositionErrors[node] = { missinglinks: [srcu] };
        }
      }
    } else {
      if (srcu in match) {
        match[srcu].push({
          name: y[ysplit.indexOf(srcn)],
          sindx: parseInt(s, 10),
          tidx: ysplit.indexOf(srcn),
          dissipative: dissipativeType,
          source: node.value["label"],
          target: noden.value["label"],
        });
      } else {
        match[srcu] = [
          {
            name: y[ysplit.indexOf(srcn)],
            sindx: parseInt(s, 10),
            tidx: ysplit.indexOf(srcn),
            dissipative: dissipativeType,
            source: node.value["label"],
            target: noden.value["label"],
          },
        ];
      }
    }
  }
  return match;
}

function addToOutput(s) {
  pythonoutput.innerHTML = s;
}

// init Pyodide
async function main() {
  //Ensure the version matches the installed pyodide version (0.23.4 as on Aug 2023)
  let pyodide = await loadPyodide({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.23.4/full",
  });

  //Load custom packages - scipy(which also loads numpy), networkx, sympy, antlr4, latex2sympy2 are required for ftuutils to load
  await pyodide.loadPackage([
      "scipy",
      "networkx",
      "sympy",
      "/pythonlibs/antlr4_python3_runtime-4.7.2-py3-none-any.whl",
      "/pythonlibs/latex2sympy2-1.9.1-py3-none-any.whl",
      "/pythonlibs/ftuutils-0.0.1-py3-none-any.whl"
    ]
  );
  return pyodide;
}
let pyodideReadyPromise = main();

//Preload python
async function preloadPython() {
  try {  
    let pyodide = await pyodideReadyPromise;
    pyodide.runPython('from ftuutils import graphutils, phsutils, sympyutils');
    pythonloaded = true;
  } catch (err) {
    console.log(err)
    showStatusMessage("Python preload failed!\n"+err,5000);
    pythonloaded = false;
  } finally{
    if(pythonloaded){
      showStatusMessage("Python preload completed!",5000);
    }
  }
}

preloadPython();

async function evaluatePython() {
  showProgressPopup();
  //Allow the UI thread to activate
  try {  
    await new Promise(r => setTimeout(r, 100));
    let pyodide = await pyodideReadyPromise;

    //Remove html decorations prior to running code
    //let code = pythoncode.innerHTML.replaceAll("<em>","").replaceAll("<strong>","").replaceAll("</em>","").replaceAll("</strong>","").replaceAll("<br/>","\n");
    //let output = pyodide.runPython(code);
    const output = pyodide.runPython(pythoncode.value);
    if (output) addToOutput(output);
  } catch (err) {
    addToOutput(err);
  }
  hideProgressPopup();
}

async function composeUsingPython() {
  showProgressPopup();
  //Allow the UI thread to activate
  try {
    await new Promise(r => setTimeout(r, 100));

    let pyodide = await pyodideReadyPromise;

    const jt = document.getElementById("jsonTxt").value;
    if(jt.length>0){
    //Remove html decorations prior to running code
    let code = `
from ftuutils.base import FTUGraph
import json
ftu = FTUGraph()
composition = json.loads("${jt}")
ftu.composeCompositePHSFromGraphicalObject(composition)
`;
   
      showStatusMessage('Starting composition',10000)
      const output = pyodide.runPython(code);
      if (output) {
        alert("Composition returned with messages. See composition window for details.");
        document.getElementById("compositemodelphs").innerHTML = output;
        document.getElementById("symbolicphscodeblock").style.display = "block";
        document.getElementById("pythonicphscodeblock").style.display = "none";    
      }else{
        alert("Composition completed!")
        showStatusMessage('Composition completed!',10000);
        document.getElementById("symbolicphscodeblock").style.display = "block";
        //Check if python code has also been loaded
        if(document.getElementById("composedPHSPython").value.length>0){
          document.getElementById("pythonicphscodeblock").style.display = "block";    
        }else{
          document.getElementById("pythonicphscodeblock").style.display = "none";    
        }
      }
    }
  } catch (err) {
    alert("Failed to compose "+err);
  }
  hideProgressPopup();
  document.body.style.cursor = "default";
}

function getPHSFromUserInput() {
  const phsname = document.getElementById("phsname").value;
  if (!phsname) {
    hideProgressPopup();
    document.body.style.cursor = "default";
    alert("Model name is required!");
    return;
  }
  generatePHSFromUserInput().then((output) => {
    if (output == null) return;
    var failed = false;
    if (output["statevector"]["success"] == false) {
      failed = true;
      document
        .getElementById("statevector")
        .classList.add("incorrectvalue-border");
    }
    if (output["hamiltonian"]["success"] == false) {
      failed = true;
      document
        .getElementById("hamiltonian")
        .classList.add("incorrectvalue-border");
    }
    if (output["hamiltonianderivatives"]["success"] == false) {
      failed = true;
      document
        .getElementById("hamiltonianderivatives")
        .classList.add("incorrectvalue-border");
    }
    if (output["JMatrix"]["success"] == false) {
      failed = true;
      document.getElementById("JMatrix").classList.add("incorrectvalue-border");
    }
    if (output["RMatrix"]["success"] == false) {
      failed = true;
      document.getElementById("RMatrix").classList.add("incorrectvalue-border");
    }
    if (output["BMatrix"]["success"] == false) {
      failed = true;
      document.getElementById("BMatrix").classList.add("incorrectvalue-border");
    }
    if (output["EMatrix"]["success"] == false) {
      failed = true;
      document.getElementById("EMatrix").classList.add("incorrectvalue-border");
    }
    if (output["QMatrix"]["success"] == false) {
      failed = true;
      document.getElementById("QMatrix").classList.add("incorrectvalue-border");
    }
    if (output["uvector"]["success"] == false) {
      failed = true;
      document.getElementById("uvector").classList.add("incorrectvalue-border");
    }
    if (!failed) {
      //Create phs
      const phsparameterlist =
        document.getElementById("phsparameterlist").value;
      let params = {};
      let plist = phsparameterlist.trim().split(",");
      for (let i = 0; i < plist.length; i++) {
        let pdef = plist[i].trim().split("=");
        let valuedim = pdef[1].trim();
        const dsi = valuedim.indexOf("{");
        const dei = valuedim.indexOf("}");
        params[pdef[0].trim()] = {"value":valuedim.substring(0,dsi),"units":valuedim.substring(dsi+1,dei)};
      }
      let statevalues = {};
      for(let i=0;i<output["statevector"]["result"]["elements"].length;i++){
        statevalues[output["statevector"]["result"]["elements"][i]] = {"value":0.0,"units":"dimensionless"};
      }
      let phsdef = {};
      phsdef["parameter_values"] = params;
      phsdef["Hderivatives"] = output["hamiltonianderivatives"]["result"];
      phsdef["hamiltonianLatex"] = output["hamiltonian"]["result"];
      phsdef["hamiltonian"] = document.getElementById("hamiltonian").value;
      let phsm = {};
      phsm["matJ"] = output["JMatrix"]["result"];
      phsm["matR"] = output["RMatrix"]["result"];
      phsm["matB"] = output["BMatrix"]["result"];
      phsm["matBhat"] = output["BbarMatrix"]["result"];
      phsm["matQ"] = output["QMatrix"]["result"];
      phsm["matE"] = output["EMatrix"]["result"];
      phsm["matC"] = output["Cmatrix"]["result"];
      phsm["u"] = output["uvector"]["result"];
      phsdef["portHamiltonianMatrices"] = phsm;
      phsdef["stateVector"] = output["statevector"]["result"];
      phsdef["state_values"] = statevalues;
      phsdef["isphenomenological"] = output["isphenomenological"];
      phsdef["success"] = true;
      //Load the model
      loadPHSTable(phsname, {
        phs: phsdef,
        success: true,
        usergenerated: true,
      });
      //Close modal
      hideProgressPopup();
      document.getElementById("createFTUJson").style.display = "none";
    } else {
      alert(
        "Highlighted input items contain syntax errors!\nUse sympy expression syntax."
      );
    }
  });
}

async function generatePHSFromUserInput() {
  document.body.style.cursor = "progress";
  showProgressPopup();
  try {  
    //Allow the UI thread to activate
    await new Promise(r => setTimeout(r, 100));

    let pyodide = await pyodideReadyPromise;
    document
      .getElementById("statevector")
      .classList.remove("incorrectvalue-border");
    document
      .getElementById("hamiltonian")
      .classList.remove("incorrectvalue-border");
    document
      .getElementById("hamiltonianderivatives")
      .classList.remove("incorrectvalue-border");
    document.getElementById("JMatrix").classList.remove("incorrectvalue-border");
    document.getElementById("RMatrix").classList.remove("incorrectvalue-border");
    document.getElementById("BMatrix").classList.remove("incorrectvalue-border");
    document.getElementById("EMatrix").classList.remove("incorrectvalue-border");
    document.getElementById("QMatrix").classList.remove("incorrectvalue-border");

    const statevector = document.getElementById("statevector").value;
    const hamiltonian = document.getElementById("hamiltonian").value;
    const hamiltonianderivatives = document.getElementById(
      "hamiltonianderivatives"
    ).value;
    const isphenomenological = document.getElementById("phenomenological").checked;

    const JMatrix = document.getElementById("JMatrix").value;
    const RMatrix = document.getElementById("RMatrix").value;
    const BMatrix = document.getElementById("BMatrix").value;
    const EMatrix = document.getElementById("EMatrix").value;
    const QMatrix = document.getElementById("QMatrix").value;
    const uvector = document.getElementById("uvector").value;
    const phsparameterlist = document.getElementById("phsparameterlist").value;
    //let pyodide = await pyodideReadyPromise;
    let code = '';
    if(isphenomenological){
      code = `
from ftuutils.sympyutils import checkUserPhenomenologicalPHS
checkUserPhenomenologicalPHS('${statevector}','${JMatrix}','${RMatrix}','${BMatrix}','${EMatrix}','${QMatrix}','${uvector}')
      `;      
    }else{
      code = `
from ftuutils.sympyutils import checkUserPHS
checkUserPHS('${statevector}','${hamiltonian}','${hamiltonianderivatives}','${JMatrix}','${RMatrix}','${BMatrix}','${EMatrix}','${QMatrix}','${uvector}')
      `;
    }
    const output = pyodide.runPython(code);
    if (output) {
      return JSON.parse(output);
    }else{
      return null;
    }

  } catch (err) {
    alert(err);
    return null;
  } finally {
    hideProgressPopup();
    document.body.style.cursor = "default";
  }
}

function setupFTUGraphEditor() {
  Client.setImageBasePath("/images");

  const bgdiv = <HTMLElement>document.getElementById("FTUGraphEditor");

  bgdiv.innerHTML = `        <div>
    <h1>FTU Weaver</h1>
    <div id="projectnameheader" style="text-align: center;position:relative;white-space:nowrap;overflow:hidden;top:0px;left:0px;min-height:24px;height:24px;right:0px;padding:6px;background-image:url('images/projectnamebar_bg.gif');"></div>
  </div>
  <div id="toolbarContainer"
    style="position:relative;white-space:nowrap;overflow:hidden;top:0px;left:0px;max-height:24px;height:36px;right:0px;padding:6px;background-image:url('images/toolbar_bg.gif');">
    <button title="New FTU graph" id="newdocument" style="font-size: 10px;"><img src="./images/newdocument.png"
        style="width: 16px; height: 16px; vertical-align: middle; margin-right: 2px;" alt="New bondgraph">New</button>
    <button title="Load FTU graph project" id="loaddocument" style="font-size: 10px;"><img src="./images/load.png"
        style="width: 16px; height: 16px; vertical-align: middle; margin-right: 2px;" alt="Load bondgraph">Open</button>
    <button title="Save FTU graph" id="savedocument" style="font-size: 10px;"><img src="./images/save.png"
        style="width: 16px; height: 16px; vertical-align: middle; margin-right: 2px;" alt="Save bondgraph">Save</button>
    <div style="display: inline; padding: 8px;"></div>
    <button title="View/Set Project Provanence" id="projectproperties" style="font-size: 10px;"><img src="./images/project.png"
        style="width: 16px; height: 16px; vertical-align: middle; margin-right: 2px;" alt="Set Provanence">Provanence</button>
    <div style="display: inline; padding: 32px;"></div>
    <button title="Compose FTU" id="composeftu" style="font-size: 10px;"><img src="./images/cellml.png"
        style="width: 16px; height: 16px; vertical-align: middle; margin-right: 2px;" alt="Compose FTU">Compose</button>
    <div style="display: inline; padding: 32px;"></div>
    <button title="Zoom in" id="zoomin" style="font-size: 10px;"><img src="./images/zoom-in.png"
        style="width: 16px; height: 16px; vertical-align: middle; margin-right: 2px;" alt="Zoom in">&nbsp</button>
    <button title="Zoom out" id="zoomout" style="font-size: 10px;"><img src="./images/zoom-out.png"
        style="width: 16px; height: 16px; vertical-align: middle; margin-right: 2px;" alt="Zoom out">&nbsp</button>
    <button title="Fit to canvas" id="zoomfit" style="font-size: 10px;"><img src="./images/zoom-fit-best.png"
        style="width: 16px; height: 16px; vertical-align: middle; margin-right: 2px;" alt="Zoom to Fit">&nbsp</button>
    <button title="Zoom Reset" id="zoomoriginal" style="font-size: 10px;"><img src="./images/zoom-original.png"
        style="width: 16px; height: 16px; vertical-align: middle; margin-right: 2px;" alt="Reset to Original">&nbsp</button>
    <div style="display: inline; padding: 32px;"></div>
    <button title="Background Image" id="bgimage" style="font-size: 10px;"><img src="./images/backgroundimage.png"
        style="width: 16px; height: 16px; vertical-align: middle; margin-right: 2px;" alt="Background Image">&nbsp</button>
    <div style="display: inline; padding: 32px;"></div>
    <button title="Help" id="helpinfo" style="font-size: 10px;"><img src="./images/help-icon.png"
        style="width: 16px; height: 16px; vertical-align: middle; margin-right: 2px;" alt="Help">&nbsp</button>
        
  </div>

  <div class="w3-bar w3-black">
    <button id="ftuEditor" title="FTU graph Editor" class="w3-bar-item w3-button" style="width: 120px;height: 30px;margin:0;border:0; background-color:gray;">GraphicalEditor</button>
    <button id="apiEditor" title="Procedural graph Editor" class="w3-bar-item w3-button" style="width: 120px;height: 30px;margin:0;border:0;">ProceduralEditor</button>
    <button id="ftuJSON" title="View Project JSON" class="w3-bar-item w3-button" style="width: 72px;height: 30px;margin:0;border:0;">Json</button>    
    <button id="ftuPHSClasses" title="PHS class setup" class="w3-bar-item w3-button" style="width: 72px;height: 30px;margin:0;border:0;">PHS</button>    
    <button id="ftuNetworkClasses" title="PHS class setup" class="w3-bar-item w3-button" style="width: 72px;height: 30px;margin:0;border:0;">Network</button>    
    <button id="ftuComposition" title="Composition report" class="w3-bar-item w3-button" style="width: 85px;height: 30px;margin:0;border:0;">Composition</button>    
  </div>
  
  <div id="HelpInformation" class="modal">
    <div class="modal-content" style="width:600px;">
      <div id="helpinfocontent"></div>
    </div>
  </div>
  <div id="ProgressPopup" class="modal">
   <div class="modal-content">
    <div class="container"> 
      <div id="loading" class="loading" style = "visibility: visible">
        Loading&#8230;     
      </div>
      <div id="progressmessage" style="display:none"></div>
    </div>
    </div>
  </div>

  <div id="ProjectProperties" class="modal">

    <!-- Modal content -->
    <div class="modal-content" style="width:200px;">
      <form>
        <label for="projectname">ProjectName:</label><br>
        <input type="text" id="projectname" name="projectname"><br>
        <label for="projectAuthor">Author:</label><br>
        <input type="text" id="projectAuthor" name="projectAuthor"><br>
        <label for="projectdescription">Project Description:</label><br>
        <textarea id="projectdescription" name="projectdescription"></textarea>
      </form>
      <button id="updateProvanence">Apply</button>
    </div>
  </div>
  <div id="createFTUJson" class="modal">
    <!-- Modal content -->
    <div class="modal-content" style="width:400px;">
      <form>
      <table>
      <tr>
      <td>
      <label for="phsname">PHS Name:</label>
      </td>
      <td>
      <input type="text" id="phsname" name="phsname">
      </td>
      </tr>
      <tr><td>&nbsp;</td></tr>      
      <tr>
      <td>
      <label for="hamiltonian">Hamiltonian:</label>
      </td>
      <td>
      <input type="text" id="hamiltonian" name="hamiltonian" value="1/2*p**2 + 1/2*q**2">
      </td>
      </tr>
      <tr>
      <td>
      <label for="phenomenological">Model is Phenomenological:</label>
      </td>
      <td>
      <input type="checkbox" id="phenomenological" name="phenomenological" >
      </td>
      </tr> 
      <tr><td>&nbsp;</td></tr>                 
        <tr>
        <td>
        <label for="statevector">State vector:</label>
        </td>
        <td>
        <input type="text" id="statevector" name="statevector" value="[[p],[q]]">
        </td>
        </tr>

        <tr>     
        <td>   
        <label for="hamiltonianderivatives">&#8711;H:</label>
        </td>
        <td>
        <input type="text" id="hamiltonianderivatives" name="hamiltonianderivatives" value="[[p/2],[q/2]]">
        </td>
        </tr>
        <tr> 
        <td>               
        <i><b>Matrices</b></i>
        </td>
        </tr>
        <tr>    
        <td>    
        <label for="JMatrix"><b>J</b></label>
        </td>
        <td>
        <input type="text" id="JMatrix" name="JMatrix" value="[[1,0],[0,-1]]">
        </td>
        </tr> 
        <tr>    
        <td>    
        <label for="RMatrix"><b>R</b></label>
        </td>
        <td>
        <input type="text" id="RMatrix" name="RMatrix" value="[[M,0],[1/c,-1]]">
        </td>
        </tr>                
        <tr>    
        <td>    
        <label for="BMatrix"><b>B</b></label>
        </td>
        <td>
        <input type="text" id="BMatrix" name="BMatrix" value="[[1,0],[0,-1]]">
        </td>
        </tr>         
        <tr>    
        <td>    
        <label for="EMatrix"><b>E</b></label>
        </td>
        <td>
        <input type="text" id="EMatrix" name="EMatrix" value="[[1,0],[0,1]]">
        </td>
        </tr>         
        <tr>    
        <td>    
        <label for="QMatrix"><b>Q</b></label>
        </td>
        <td>
        <input type="text" id="QMatrix" name="QMatrix" value="[[1/L,0],[0,1/C]]">
        </td>
        </tr>   
        <tr> <td> <i><b>Inputs</b></i> </td> </tr>
        <tr>    
        <td>    
        <label for="uvector"><b>u</b></label>
        </td>
        <td>
        <input type="text" id="uvector" name="uvector" value="[[u1],[i1]]">
        </td>
        </tr>               
      </table>
      <br>
      <b>Parameters</b><br>
      <!-- <table id="createphsparameters"></table> -->
      <textarea id="phsparameterlist" name="phsparameterlist" rows="4" cols="49">C=0.5773{dimensionless},
L= 1.7320{dimensionless},
M= p*p*p-3*p{dimensionless},
r= 6{dimensionless}</textarea>
      </form>
      <center><button id="createPHSJSON">Create</button></center>
    </div>
  </div>  
  <div id="loadFTUJson" class="modal">
    <!-- Modal content -->
    <div class="modal-content" style="width:200px;">
      <form>
        <label for="projectfile">Project File:</label><br>
        <input type="file" id="projectfile" name="projectfile"><br>
      </form>
      <button id="loadProjectFile">Apply</button>
    </div>
  </div>
  <div id="loadFTUImage" class="modal">
    <!-- Modal content -->
    <div class="modal-content" style="width:200px;">
      <form>
        <label for="projectimagefile">Image File:</label><br>
        <input type="file" id="projectimagefile" name="projectimagefile"><br>
      </form>
      <button id="loadProjectImageFile">Apply</button>
    </div>
  </div>  
  <div id="showPHSList" class="modal">
    <!-- Modal content -->
    <div id="showPHSListtable" class="modal-content" style="width:200px;">


    </div>
  </div>    
  <div id="loadPHSDialog" class="modal">
    <!-- Modal content -->
    <div class="modal-content" style="width:300px;">
      <table>
        <tr>
        <td>
        <label for="phscellmlfile">Project File:</label>
        </td>
        <td>
        <input type="file" id="phscellmlfile" name="phscellmlfile">
        </td>
        </tr>
        <tr>
          <td>From PMR</td>
          <td>
            <input list="FromPMR" id="FromPMRFiles"  placeholder = "Select existing model">
            <datalist id="FromPMR">
              <option value="File">
              <option value="FitzHugh Nagumo">
            </datalist> 
          </td>
        </tr>
        <tr>
        <td>
          <label>Node color</label>
        </td>
        <td>
          <div id="phscolorpickerparent" style="min-width: 20px; max-width: 20px; background: #00ccffff">&nbsp;&nbsp;&nbsp;&nbsp;</div>
        </td>
        </tr>
        <tr>
        <td><button id="loadPHS">Apply</button></td>
        <td>&nbsp</td>
        </tr>
      </table>
    </div>
  </div>

  <div id="GraphicalEditor" class="w3-container w3-tab">
    <div class="container">
      <div id="toolbar-container" class="left" style="max-height: 800px; min-width: 220px; max-width: 250px; overflow-y: scroll;"></div>
      <div id="graph-container" class="center" style="width: 60%;"></div>
      <div id="properties-container" class="right"
        style="width: 20%;text-align:left;top:0px;left:0px;max-height:24px;height:36px;right:0px;padding:6px;background-image:url('images/toolbar_bg.gif');">
        <div class="w3-bar w3-black">
          <button class="w3-bar-item w3-button" style="width: 72px;height: 30px;margin:0;border:0;">Properties</button>
        </div>
        <div id="Properties" class="w3-container w3-tab">
          <div style="height:100%;">
            <div style="height:30%;min-height: 15vh;">
              <div id="PropertiesContent" style="display:none;">
                <h2>Element Properties</h2>
                <table>
                  <tr>
                    <td><b>Label:</b></td>
                    <td id="currentElementName" data-init='' style="min-width:50px;border:1px solid block"></td>
                    <td style="min-width:20px">&nbsp</td>
                    <td><div id="colorpickerparent">&nbsp&nbsp&nbsp&nbsp</div></td>   
                    <td style="min-width:20px">&nbsp</td>
                  </tr>
                  <tr>
                  <td><div id="phsclasslabel"><b>PHS class:</b></div></td>
                  <td style="min-width:20px">&nbsp</td>
                  <td style="min-width:20px">&nbsp</td>
                  <td style="min-width:20px">&nbsp</td>
                  <td style="max-width:80px; word-wrap: break-word" id="currentElementPHSclass"></td>
                  </tr>
                </table>
                <div id="propTable">
                </div>
              </div>
            </div>
            <div id="NetworkContent" style="overflow-y: scroll;min-height:60%">
              <h4>Networks</h4>
              <table id="displayActiveNetworks" style="width:100%">

              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div id="ProceduralEditor" class="w3-container w3-tab" style="display:none">
  <h3>Python</h3>
  <textarea id="apiTxt" style="width:90%;height:300px;overflow:auto;">
#Package import for handling json data
import json
#Package import to call javascript functions to load python outputs on html elements for visualisation - not required in pure pythonic environments
import js
#Package imports to support FTU generation
from ftuutils import graphutils, phsutils
#Define the list of phs to be used by the FTU

phsval = '{\\"Hderivatives\\":{\\"cols\\":1,\\"elements\\":[\\"p/L\\",\\"q/C\\"],\\"rows\\":2},\\"hamiltonian\\":\\"(1/2)*(1/C)*q**2+(1/2)*(1/L)*p**2\\",\\"hamiltonianLatex\\":\\"\\\\\\\\left(\\\\\\\\frac{1}{2}\\\\\\\\right)\\\\\\\\frac{q^2}{C}+\\\\\\\\left(\\\\\\\\frac{1}{2}\\\\\\\\right)\\\\\\\\frac{p^2}{L}\\",\\"parameter_values\\":{\\"C\\":{\\"value\\":\\"0.5773\\",\\"units\\":\\"dimensionless\\"},\\"L\\":{\\"value\\":\\"1.7320\\",\\"units\\":\\"dimensionless\\"},\\"M\\":{\\"value\\":\\"p*p*p-3*p\\",\\"units\\":\\"dimensionless\\"},\\"r\\":{\\"value\\":\\"6\\",\\"units\\":\\"dimensionless\\"}},\\"portHamiltonianMatrices\\":{\\"matB\\":{\\"cols\\":2,\\"elements\\":[\\"1\\",\\"0\\",\\"0\\",\\"1\\"],\\"rows\\":2},\\"matE\\":{\\"cols\\":2,\\"elements\\":[\\"1\\",\\"0\\",\\"0\\",\\"1\\"],\\"rows\\":2},\\"matJ\\":{\\"cols\\":2,\\"elements\\":[\\"0\\",\\"-1\\",\\"1\\",\\"0\\"],\\"rows\\":2},\\"matQ\\":{\\"cols\\":2,\\"elements\\":[\\"1/L\\",\\"0\\",\\"0\\",\\"1/C\\"],\\"rows\\":2},\\"matR\\":{\\"cols\\":2,\\"elements\\":[\\"M\\",\\"0\\",\\"0\\",\\"1/r\\"],\\"rows\\":2},\\"u\\":{\\"cols\\":1,\\"elements\\":[\\"u\\",\\"i\\"],\\"rows\\":2},\\"u_orientation\\":{\\"cols\\":1,\\"elements\\":[true,true],\\"rows\\":2}},\\"stateVector\\":{\\"cols\\":1,\\"elements\\":[\\"p\\",\\"q\\"],\\"rows\\":2},\\"state_values\\": {\\"p\\": {\\"value\\":\\"0.5\\",\\"units\\":\\"dimensionless\\"},\\"q\\": {\\"value\\":\\"0.0\\",\\"units\\":\\"dimensionless\\"}},\\"success\\":true}'  
  
phstypes = {'FHN':json.loads(phsval)}

#To use the phs instances loaded in the window/PHS tab use
#phstypes = phsutils.getAllPHSDefinitions()

#Here we use the first phs as the default phs for all cells

ks = list(phstypes.keys())
g = graphutils.Lattice2D(5,5,ks[0])
g.setFibreConductivity(1.2)
g.setSheetConductivity(0.9)    
g.setDefects([[[1,3],[2,3]]])

#Setup stimulus blocks
g.setStimulationBlock('b1',[[1,3],[0,0]])
nxg = g.getGraph()

#Use g.setCellType(nxg,dict) dict = {nodeid:'phsname'...}

#Provide a dictionary to store connection information
phsdata = {}

#Specify for each PHS class, for each input component the network on which it connects
phsdata = phsutils.connect(phsdata , 'FHN','u',1) #Connection on u

#Boundary connections can be specified as below. As a convention, boundary networks are negatively numbered
phsdata = phsutils.connectToBoundary(phsdata, 'FHN','i',-1) #Boundary connection for i

#Node that receive external inputs can be specified as below - these are boundary connections and the network no is negatively
#All external inputs with the same network number share the same input variable, if you want different input variable for each 
#external input, provide different network numbers
simb = g.getStimulusBlockNodes('b1')
for ein in simb:
    phsdata = phsutils.addExternalInput(phsdata,ein,'u',-2)

#Set which networks are dissipative and add the information to the phsdata dictionary

networkDissipation = {1:True}
networkNames = {1:"ucap",-1:"threshold",-2:"ubar"}

phsdata["networkNames"] = networkNames
phsdata["networkDissipation"] = networkDissipation

#Compose the FTU and load them for visualisation
msg = "Success"
try:
    composer = g.composeCompositePHS(nxg,phstypes,phsdata)
    #Load the latex into the composition symbolic phs element
    ltx = composer.generateLatexReport()
    #All js calls will not work in pure pythonic environments
    js.loadGeneratedLatex(ltx)  
    #Load the python code into the composition pythonic phs element
    pcode = composer.exportAsPython()
    js.loadGeneratedPython(pcode)
    #Save the composition for loading into graph editor if required
    srcomp = composer.getSourceComposition()
    #Convert dict to json string to pass this data to javascript
    js.setupSourceComposition(json.dumps(srcomp))    
except Exception as inst:
    msg = f"Failed - see console for error messages\\n {inst}"

#Check result

msg  
    </textarea>
  <!-- <div id="apiTxt" class="editor" contenteditable="true" spellcheck="false"></div> -->
  <h4>Python messages</h4>
  <div id="pythonconsole" style="width:80%;height:100px;overflow:auto;"></div>
  <table>
  <tr>
  <td>
  <button id="generateGraphUsingAPI">Generate</button>   
  </td>
  <td>
  <button id="loadAPIModel" data-init='' style="display:none">Load Model</button>   
  </td>
  </tr>
  </table>
  </div>
  <div id="Json" class="w3-container w3-tab" style="display:none">
    <h3>JSON</h3>
    <textarea id="jsonTxt" style="display:none">  </textarea>
    <div id="jview" style="height:400px;overflow:auto;"></div>
    <br>
    <button id="saveprojectBtn">Save</button>
  </div>
  <div id="PHS" class="w3-container w3-tab" style="display:none">
    <div id="phsinstance-container" class="left" style="max-height: 800px; width: 30%; overflow-y: scroll;">
    <div style="position: relative; min-height: 580px;">
    <h3>Configure PHS</h3>
    <!-- Provide delete button next to the entry-->
    <table id="phslist"></table>
      <div style="position: absolute; bottom: 0; left: 0;">
        <table>
          <tr>
            <td>&nbsp;</td>
            <td><button id="loadPHSBtn">Load PHS</button></td>
            <td>&nbsp;</td>
            <td><button id="createPHSBtn">Create PHS</button></td>            
          </tr>
        </table>
      </div>
    </div>
    </div>
    <div id="phs-container" class="center" style="width: 70%;">
      <div id="phsinstancename" style="font-size: large;text-align: center;"></div>
      <div id="phsMathML"></div>
      <div style="width: 200px;  margin: 0 auto; display: inline;">
      <center>
        <button style="display: none" id="updatePHSInstance">Update</button> &nbsp;
        <button style="display: none" id="savePHSInstanceToFile">Save to File</button>
      </center>
      </div>
    </div>
  </div>  
  <div id="Network" class="w3-container w3-tab" style="display:none">
    <div id="network-container" class="left" style="max-height: 800px; width: 32%; overflow-y: scroll;">
      <h3>Configure Network</h3>
      <!-- Provide delete button next to the entry-->
      <div style="height:60%;overflow-y: scroll;">
        <table id="configureActiveNetworks" style="width:100%"></table>
      </div>
      <div style="height:30%;overflow-y: scroll;">
        <div>
        <br>
        <h3>Select Networks:</h3>
        <textarea id="networkselection" style="width: 80%"></textarea><br>
        <button id="selectlistofnetworks">Apply</button>
        </div>
      </div>      
    </div>
    <div id="networkinstance-container" class="center" style="width: 65%;">
      <div id="networkid" style="font-size: large;text-align: center;" data-init=''></div>
      <div id="networkTxt" style="display:none">
        <div id="boundarynetworkdef" style="display:none; position: relative;">
          <h2>Define input/output components provided by the network</h2>
            <table style="width:70%">
              <tr>
                <th>PHS Class</th>
                <th>Input components</th>
              </tr>
              <tr>
                <td style="vertical-align:top; min-width:100px;" align='center'>
                  <!-- <input list="networkphsclassselection" name="networkphsclassselection" id="networkphsclassselectioninput" style="width:100%">
                  <datalist id="networkphsclassselection">   
                  </datalist>              -->
                  <div style="margin: auto; ">
                  <button id="networkphsclassselection">Select</button>
                  </div>
                </td>
                <td>
                  <table id="networkphsclassinputunames" style="margin:0 auto">
                    
                  </table>
                </td>
              </tr>
            </table><br>
            <div style="position: absolute; bottom: 0px;" align="center">
              <button id="saveNetworkConfigBtn">Apply</button>
            </div>            
          </div>
        </div>
        <div id="internalnetworkdef" style="display:none"><br>Mapping for internal networks is determined from PHS instance assignments</div>
      </div>
  </div>


  <div id="Composition" class="w3-container w3-tab" style="display:none">
    <div style="margin-top: 10px;">
    <div class="w3-bar w3-black">
      <button id="symbolicphsbutton" class="w3-bar-item w3-button" style="width: 90px;height: 30px;margin:0;border:0;">SymbolicPHS</button>
      <button class="w3-bar-item w3-button" style="width: 90px;height: 30px;margin:0;border:0;">PythonicPHS</button>
    </div>    
    <div id="SymbolicPHS" class="w3-container w3-tab">
      <div id="symbolicphscodeblock" style="display:none">
        <h3>Symbolic Composition</h3>
        <div style="height:490px;overflow-y:scroll">
          <textarea id="composedPHS" style="display:none"></textarea>
          <div id="compositePHS"></div><br>
          <div id="compositemodelphs" style=""></div>
        </div><br>
        <button id="saveCompositionBtn">Save</button>
      </div>
    </div>
    <div id="PythonicPHS" class="w3-container w3-tab">
      <div id="pythonicphscodeblock" style="display:none">
        <h3>Python code</h3>
        <textarea id="composedPHSPython" style="width:90%;height:400px;overflow:auto;display:none"></textarea><br>
        <div>&nbsp;</div>
        <button id="exportCompositionCodeBtn">Save</button>
      </div>      
    </div>
    </div>
  </div>
  <div id="statusbar" style="text-align: center;position:relative;white-space:nowrap;overflow:hidden;top:0px;left:0px;min-height:24px;height:24px;right:0px;padding:6px;background-image:url('images/projectnamebar_bg.gif');"></div>
  `;

  const div = <HTMLElement>document.getElementById("graph-container");
  const tdiv = <HTMLElement>document.getElementById("toolbar-container");
  const pdiv = <HTMLElement>document.getElementById("properties-container");

  const container = document.createElement("div");
  container.style.position = "relative";
  container.style.overflow = "hidden";
  container.style.width = `100%`;
  container.style.height = `600px`;
  container.style.display = "flex";
  container.style.flexFlow = "row";
  container.style.flexGrow = true;
  container.style.background = "url(/images/grid.gif)";
  container.style.cursor = "default";
  div.appendChild(container);

  InternalEvent.disableContextMenu(container);

  // Defines an icon for creating new connections in the connection handler.
  // This will automatically disable the highlighting of the source vertex.
  ConnectionHandler.prototype.connectImage = new ImageBox(
    "/images/connector.gif",
    16,
    16
  );

  // Creates the div for initial graph setup
  tbContainer = document.createElement("div");
  tbContainer.style.position = "relative";
  tbContainer.style.overflow = "hidden";
  tbContainer.style.padding = "2px";
  tbContainer.style.left = "0px";
  tbContainer.style.top = "0px";
  tbContainer.style.width = "200x";
  tbContainer.style.bottom = "0px";

  tdiv.appendChild(tbContainer);

  //tbContainer.innerHTML = ``;
  const grpPanel = createToolBarGroup("By Elements", true);
  const grpCreate = createToolBarGroup("Batch create", true);
  grpCreate.innerHTML = `<table>
  <tr>
     <td style="text-align:left;">Rows</td>
     <td style="text-align:left;">Columns</td>
  </tr>
  <tr>
  <td><input type="number" id="numrows" name="numrows" min="1" max="20" value=5 style="max-width: 50px;"></td>        
     <td><input type="number" id="numcols" name="numcols" min="1" max="20" value=5 style="max-width: 50px;"></td>
  </tr>
</table>
<input type="checkbox" id="withboundarynodes" name="withboundarynodes" value="connect">
<label for="withboundarynodes"><small>With Boundary</small></label><br>
<input type="checkbox" id="saveexistingnodes" name="saveexistingnodes" value="connect">
<label for="saveexistingnodes"><small>Append to existing</small></label><br>
<input type="checkbox" id="triangulatedmesh" name="triangulatedmesh" value="connect">
<label for="triangulatedmesh"><small>Delaunay Mesh</small></label><br>
<button title="Generate" id="generategraph" style="font-size: 12px; width: 100%">Generate</button><br>
`;

  const nodeSelection = createToolBarGroup("Node Selection", false);
  nodeSelection.innerHTML = `  <p style="text-align:left;">Level set (x=<i>rows</i>,y=<i>cols</i>,i=<i>index</i>)</p>
  <textarea tyle="max-width: 40px;" id="levelsetdesc"></textarea>
  <button title="applylevelset" id="applylevelset" style="font-size: 12px;">Apply</button>
`;

  const selectedNodes = createToolBarGroup("Selected Nodes", true);
  selectedNodes.innerHTML = `<br><textarea tyle="max-width: 40px;" id="selectednodes"></textarea><br>`;

  const nodeActions = createToolBarGroup("Node Actions", false);
  nodeActions.innerHTML = `  <div>
  <table>
     <tr>
        <td colspan="2">
           <button title="DeleteNodes" id="deletenodes" style="font-size: 12px; width: 100%;">Delete selected</button>
        </td>
     </tr>
     <tr>
        <td colspan="2">
           <button title="setclass" id="setnodeclass" style="font-size: 12px;width: 100%;">Set PHS</button>
        </td>
     </tr>
     <tr>
        <td>
           <button title="setclass" id="connectnode" style="font-size: 12px;">Connect</button>
        </td>
        <td>
           <input list="number" name="connectnodeid" id="connectnodeid" style="max-width: 80px;">
        </td>
     </tr>
  </table>
</div>`;

  const edgeSelection = createToolBarGroup("Edge Selection", false);
  edgeSelection.innerHTML = `  <p style="text-align:left;">Level set (i=<i>index</i>)</p>
<textarea tyle="max-width: 40px;" id="levelsetedgedesc"></textarea>
<button title="applyedgelevelset" id="applyedgelevelset" style="font-size: 12px;">Apply</button>
`;

  const selectedEdges = createToolBarGroup("Selected Edges", false);
  selectedEdges.innerHTML = `<br><textarea tyle="max-width: 40px;" id="selectededges"></textarea><br>`;

  const edgeActions = createToolBarGroup("Edge Actions", false);
  edgeActions.innerHTML = `  <div>
<table>
  <tr>
  <td colspan="2">
  <input type="checkbox" id="showhideedgelabels" name="showhideedgelabels" value="showedge" checked>
  <label for="showhideedgelabels"><small>Show/Hide Edge Labels</small></label>
  </td>
  </tr>
   <tr>
      <td colspan="2">
         <button title="DeleteEdges" id="deleteedges" style="font-size: 12px; width: 100%;">Delete selected</button>
      </td>
   </tr>
   <tr>
    <td colspan="2"><small>Set edge weight for network</small></td>
  </tr>
  <tr>
      <th>Network ID</th>
      <th>Weight</th>
  </tr>
   <tr>
     <td>
        <input type="number" name="edgenetworkid" id="edgenetworkid" style="max-width: 80px;">
      </td>
      <td>
         <input type="number" name="edgeweight" id="edgeweight" style="max-width: 80px;" value=0.0>
      </td>
   </tr>
  <tr>
  <td colspan="2">
    <button title="setweight" id="setweight" style="font-size: 12px; width:100%">Set weight</button>
  </td>
  <tr>
  <td colspan="2">
    <button title="removeweight" id="removeweight" style="font-size: 12px; width:100%">Remove Network</button>
  </td>  
  </tr>
  </tr>
</table>
</div>`;

  window.showProgressPopup = async function(msg=""){
    document.getElementById("progressmessage").innerHTML = msg;
    document.getElementById("ProgressPopup").style.display = 'block';
  }

  window.hideProgressPopup = async function(){
    document.getElementById("progressmessage").innerHTML = "";
    document.getElementById("ProgressPopup").style.display = 'none';
  }


  document
    .getElementById("showhideedgelabels")
    .addEventListener("change", function () {
      if (this.checked) {
        showEdgeLabels = true;
      } else {
        showEdgeLabels = false;
      }
      graph.refresh();
    });

  // Creates the model and the graph inside the container
  // using the fastest rendering available on the browser
  model = new GraphDataModel();
  graph = new Graph(container, model);

  const toolbar = new MaxToolbar(grpPanel);
  toolbar.enabled = false;
  toolbar.container.style.width = "150px";

  function addToolbarItem(title, prototype, image) {
    // Function that is executed when the image is dropped on
    // the graph. The cell argument points to the cell under
    // the mousepointer if there is one.
    const funct = (graph, evt, cell) => {
      graph.stopEditing(false);
      const pt = graph.getPointForEvent(evt);
      const vertex = graph.getDataModel().cloneCell(prototype);
      vertex.geometry.x = pt.x;
      vertex.geometry.y = pt.y;
      vertex.geometry.width = 15.0;
      vertex.geometry.height = 15.0;
      //const numCells = Object.keys(graph.getDataModel().cells).length -1;
      vertex.value = {
        label: "" + currentNodeOffset,
        type: prototype.value["type"],
      };
      if (prototype.value["type"] == "in") {
        vertex.style = {
          shape: "rectangle",
          fillColor: "rgb(195, 217, 255)",
          strokeColor: "transparent",
          fontSize: 8,
          fontStyle: 1,
          fontColor: "black",
          resizable: 0,
        };
      } else {
        vertex.style = {
          shape: "ellipse",
          fillColor: "rgb(217, 195, 255)",
          strokeColor: "transparent",
          fontSize: 8,
          fontStyle: 1,
          fontColor: "black",
          resizable: 0,
        };
      }
      graphNodes[currentNodeOffset] = vertex;
      currentNodeOffset += 1;
      graph.addCell(vertex);
      updatePropertiesBar(vertex);
      graph.setSelectionCell(vertex);
    };
    // Create prototypes
    // Creates the image which is used as the drag icon (preview)
    const img = toolbar.addMode(title, image, funct, image, "StyleToolbarItem");
    if (image == null) {
      img.innerHTML = title;
    }
    // Disables dragging if element is disabled. This is a workaround
    // for wrong event order in IE. Following is a dummy listener that
    // is invoked as the last listener in IE.
    InternalEvent.addListener(img, "mousedown", (evt) => {
      // do nothing
    });

    // This listener is always called first before any other listener
    // in all browsers.
    InternalEvent.addListener(img, "mousedown", (evt) => {
      if (img.enabled == false) {
        InternalEvent.consume(evt);
      }
    });

    gestureUtils.makeDraggable(img, graph, funct);
    return img;
  }

  function addVertex(title, type, icon, w, h, style) {
    const vertex = new Cell(title, new Geometry(0, 0, w, h), style);
    vertex.setVertex(true);
    vertex.value = {
      type: type,
      label: title,
    };
    const img = addToolbarItem(title, vertex, icon);
    img.enabled = true;

    graph.getSelectionModel().addListener(InternalEvent.CHANGE, () => {
      const tmp = graph.isSelectionEmpty();
      styleUtils.setOpacity(img, tmp ? 100 : 20);
      img.enabled = tmp;
    });
  }

  addVertex("Interior", "in", "images/phs.png", 10, 10, "");
  addVertex("Boundary", "out", "images/gear.png", 10, 10, "");

  var colorpickerparent = document.getElementById("colorpickerparent");
  var picker = new Picker(colorpickerparent);

  picker.onDone = function (color) {
    colorpickerparent.style.background = color.rgbaString;
    if (currentFTUElement != "") {
      let ccell = graph.getDataModel().getCell(currentFTUElement);
      if (!ccell.edge) {
        styleUtils.setCellStyles(
          graph.model,
          [ccell],
          "fillColor",
          color.rgbaString
        );
        graph.refresh(ccell); //Call this to update on canvas, ensure styles are not shared i.e. each cell has its own style instance use Object.assign of repeating
      }
    }
  };

  showStatusMessage("Python modules are loading, composing and procedural editor are not available!",50000);

  var phscolorpickerparent = document.getElementById("phscolorpickerparent");
  var phspicker = new Picker(phscolorpickerparent);

  phspicker.onDone = function (color) {
    phscolorpickerparent.style.background = color.rgbaString;
  };
  //Python setup
  pythonoutput = document.getElementById("pythonconsole");
  pythoncode = document.getElementById("apiTxt");
  //Code Editor setup
  //editor(pythoncode);

  // monaco.editor.create(document.getElementById('apiTxt'), {
  //   value: "function hello() {\n\talert('Hello world!');\n}",
  //   language: 'javascript',
  // });

  displayActiveNetworkDataTableEditor = null;
  configureActiveNetworksDataTableEditor = null;

  window.displayActiveNetworkDataTableHandler = function(e: any){
      if (e.target.matches("input[type=checkbox]")) {
        //Handle dissipation flag
        if(e.target.classList.contains("networkselection")){
          //Update activeNetworks
          let id = parseInt(e.target.parentElement.parentElement.childNodes[2].textContent,10);
          activeNetworks[id]['dissipative'] = e.target.checked;

          const sid = ''+id;
          let atable = document.getElementById("displayActiveNetworks");
          for (let i = 1, row; row = atable.rows[i]; i++) {
            if(row.children[2].textContent==sid){
              row.children[3].childNodes[0].checked = e.target.checked;
              if(e.target.checked){
                  row.classList.add("dissipativenet");
              }else{
                  row.classList.remove("dissipativenet");
              }               
              break;
            }
          }
          let ctable = document.getElementById("configureActiveNetworks");
          for (let i = 1, row; row = ctable.rows[i]; i++) {
            if(row.children[2].textContent==sid){
              row.children[3].childNodes[0].checked = e.target.checked;
              if(e.target.checked){
                  row.classList.add("dissipativenet");
              }else{
                  row.classList.remove("dissipativenet");
              }               
              break;
            }
          }        
        }
      }
  }

  window.loadGeneratedLatex = function(ltx){
    let amb = document.getElementById('compositemodelphs')
    amb.style.display = 'block'
    amb.innerHTML = ltx
    mathjaxTypeset(() => { const math = document.getElementById('compositemodelphs'); return [math];});
    document.getElementById("symbolicphscodeblock").style.display = 'block';
  };

  window.loadGeneratedPython = function(pcode){
    let amb = document.getElementById('composedPHSPython')
    amb.style.display = 'block'
    amb.innerHTML = pcode
    document.getElementById("pythonicphscodeblock").style.display = 'block';
  };

  window.setupSourceComposition = function(composition){
    let amb = document.getElementById("loadAPIModel")
    amb.style.display = 'block'
    amb.dataset.init = composition  
   }

  //Define a handle to enable python to call typesetting
  window.typesetCompositePHS = function(elem){
    mathjaxTypeset(() => { const math = document.getElementById(elem); return [math];});
  };


  window.configureActiveNetworksDataTableHandler = function(e: any){
      if (e.target.matches("input[type=checkbox]")) {
        //Handle dissipation flag
        if(e.target.classList.contains("networkselection")){
          //Update activeNetworks
          let id = parseInt(e.target.parentElement.parentElement.childNodes[2].textContent,10);
          const sid = ''+id;
          activeNetworks[id]['dissipative'] = e.target.checked;   
          let atable = document.getElementById("displayActiveNetworks");
          for (let i = 1, row; row = atable.rows[i]; i++) {
            if(row.children[2].textContent==sid){
              row.children[3].childNodes[0].checked = e.target.checked;
              if(e.target.checked){
                row.classList.add("dissipativenet");
              }else{
                  row.classList.remove("dissipativenet");
              }               
              break;
            }
          }
          let ctable = document.getElementById("configureActiveNetworks");
          for (let i = 1, row; row = ctable.rows[i]; i++) {
            if(row.children[2].textContent==sid){
              row.children[3].childNodes[0].checked = e.target.checked;
              if(e.target.checked){
                  row.classList.add("dissipativenet");
              }else{
                  row.classList.remove("dissipativenet");
              }               
              break;
            }
          } 
        }else if(e.target.classList.contains("itemselection")){
          let txt = document.getElementById("networkselection").value.trim().split(",");
          let elem  = parseInt(e.target.parentElement.parentElement.children[2].textContent,10);
          let newtxt = null;
          let selems = [];
          if(txt[0].length>0){//Handle ['']
            selems = txt.map((x)=>parseInt(x,10));
          }
          if(selems.includes(elem) && !e.target.checked){
            newtxt = selems.filter(e => e !== elem);
            selems = newtxt;
          }else if(e.target.checked){
            selems.push(elem);
          }
          const telems = selems.map((x)=>''+x);
          document.getElementById("networkselection").value = telems.join();
          {
            var event = new CustomEvent("networkselectedforconfiguration", {
              "detail": e.target.checked
            });
            // Dispatch/Trigger/Fire the event
            document.dispatchEvent(event);
          }
        }
      }
  }


   window.handleDisplayActiveNetworkTableEdit = function(value, oldData, rowIndex, columnIndex) {
      //const atable = document.getElementById("displayActiveNetworks");
      const ctable = document.getElementById("configureActiveNetworks");
      ctable.rows[rowIndex+1].children[1].textContent = value;
      const id = parseInt(ctable.rows[rowIndex+1].children[2].textContent,10);
      activeNetworks[id].name = value;
      configureActiveNetworksDataTable.data.data[rowIndex][2].data = value;
   };


   window.handleConfigureActiveNetworksDataTableEdit = function(value, oldData, rowIndex, columnIndex) {
    const atable = document.getElementById("displayActiveNetworks");
    //const ctable = document.getElementById("configureActiveNetworks");
    atable.rows[rowIndex+1].children[1].textContent = value;
    const id = parseInt(atable.rows[rowIndex+1].children[2].textContent,10);
    activeNetworks[id].name = value;
    displayActiveNetworkDataTable.data.data[rowIndex][2].data = value;
 };

  window.reloadDisplayActiveNetworkDataTable = function(){
    let ndata = [];
    for (const [key, value] of Object.entries(activeNetworks)) {
      ndata.push([value.type,value.edges,value.name,value.id,value.dissipative,false]);
    }
    let newData = {
      headings : ["Type","Edges","Name","ID","Dissipative?","Select"],
      data : ndata
    }
    displayActiveNetworkDataTable.insert(newData);  
    configureActiveNetworksDataTable.insert(newData); 
    displayActiveNetworkDataTable.refresh();
    configureActiveNetworksDataTable.refresh();
  };

  window.resetDisplayActiveNetworkDataTable = function() {
    if (displayActiveNetworkDataTableEditor) {
      displayActiveNetworkDataTableEditor.destroy()
    }
    if (configureActiveNetworksDataTableEditor) {
      configureActiveNetworksDataTableEditor.destroy()
    }
    if (displayActiveNetworkDataTable) {
      displayActiveNetworkDataTable.destroy()
    }
    if (configureActiveNetworksDataTable) {
      configureActiveNetworksDataTable.destroy()
    }    
    displayActiveNetworkDataTable = new DataTable("#displayActiveNetworks", {
      searchable: true,
      fixedHeight: false,
      perPage: 3,
      perPageSelect: false,
      rowRender: (rowValue, tr, _index) => {
        if (!tr.attributes) {
            tr.attributes = {} as any;
        }
        if(! ("class" in tr.attributes)){
          tr.attributes["class"] = []
        }

        if("checked" in tr.childNodes[3].childNodes[0].attributes){
          tr.attributes["class"] = "dissipativenet";
        }else{
          tr.attributes["class"] = "";
        }
        
        return tr
      },      
      columns: [
        // Sort the second column in ascending order
        { select: 0, type: 'string', 
            render: function(data, td, rowIndex, cellIndex) {
              if(data=='generic'){
                return `I`;  
              }else{
                return `B`;  
              }
              return `${data}`;
          }
        },
        { select: 1, type: 'string', hidden:true},
        { select: 2, type: 'string'},
        { select: 3, type: 'number'},
        { select: 4, type: 'bool',
          render: function(data, td, rowIndex, cellIndex) {
            if(data){
              return `<input type="checkbox" class="networkselection" checked>`;
            }
            return `<input type="checkbox" class="networkselection">`;
          }
        },
        { select: 5, type: 'bool',hidden:true },
      ],
      labels: {
        placeholder: "Search networks...",
        searchTitle: "Search within networks",
        perPage: "Networks per page",
        noRows: "No networks defined",
        info: "Showing {start} to {end} of {rows} networks (Page {page} of {pages} pages)",
    },      
    });

    displayActiveNetworkDataTableEditor = makeEditable(displayActiveNetworkDataTable, {
      contextMenu: false,
      hiddenColumns: true,
      excludeColumns: [0,1,3,4,5],
      inline: true
    });
    displayActiveNetworkDataTable.on("editable.save.cell",handleDisplayActiveNetworkTableEdit);


    //Click handler
    document.removeEventListener("click",displayActiveNetworkDataTable.dom,displayActiveNetworkDataTableHandler);
    displayActiveNetworkDataTable.dom.addEventListener("click",displayActiveNetworkDataTableHandler);

    configureActiveNetworksDataTable = new DataTable("#configureActiveNetworks", {
      searchable: true,
      fixedHeight: false,
      perPage: 5,
      perPageSelect: false,
      rowRender: (rowValue, tr, _index) => {
        if (!tr.attributes) {
            tr.attributes = {} as any;
        }
        if(! ("class" in tr.attributes)){
          tr.attributes["class"] = []
        }

        if("checked" in tr.childNodes[3].childNodes[0].attributes){
          tr.attributes["class"] = "dissipativenet";
        }else{
          tr.attributes["class"] = "";
        }
        
        return tr
      },       
      columns: [
        // Sort the second column in ascending order
        { select: 0, type: 'string', 
            render: function(data, td, rowIndex, cellIndex) {
              if(data=='generic'){
                return `I`;  
              }else{
                return `B`;  
              }
              return `${data}`;
          }
        },
        { select: 1, type: 'string', hidden:true},
        { select: 2, type: 'string'},
        { select: 3, type: 'number'},
        { select: 4, type: 'bool',
          render: function(data, td, rowIndex, cellIndex) {
            if(data){
              return `<input type="checkbox" class="networkselection" checked>`;
            }
            return `<input type="checkbox" class="networkselection">`;
          }
        },
        { select: 5, type: 'bool',
          render: function(data, td, rowIndex, cellIndex) {
            if(data){
              return `<input type="checkbox" class="itemselection" checked>`;
            }
            return `<input type="checkbox" class="itemselection">`;
          }
        },
      ],
      labels: {
        placeholder: "Search networks...",
        searchTitle: "Search within networks",
        perPage: "Networks per page",
        noRows: "No networks defined",
        info: "Showing {start} to {end} of {rows} networks (Page {page} of {pages} pages)",
    },      
    });

    //Click handler
    document.removeEventListener("click",configureActiveNetworksDataTable.dom,configureActiveNetworksDataTableHandler);
    configureActiveNetworksDataTable.dom.addEventListener("click", configureActiveNetworksDataTableHandler);

    configureActiveNetworksDataTableEditor = makeEditable(configureActiveNetworksDataTable, {
      contextMenu: false,
      hiddenColumns: true,
      excludeColumns: [0,1,3,4,5],
      inline: true
    });
    configureActiveNetworksDataTable.on("editable.save.cell",handleConfigureActiveNetworksDataTableEdit);

  }

  //Create an instance
  resetDisplayActiveNetworkDataTable();

  /* Graph setup */

  graph.setHtmlLabels(true);
  graph.setTooltips(true);
  graph.setPanning(true);

  // Enables new connections in the graph
  graph.setConnectable(true);
  graph.setMultigraph(false);
  graph.setAllowDanglingEdges(false);
  graph.setEdgeLabelsMovable(true);

  graph.addListener("click", function (sender, evt) {
    var cell = evt.getProperty("cell"); // cell may be null

    if (cell != null) {
      updatePropertiesBar(graph.getDataModel().getCell(cell.id));
    } else {
      updatePropertiesBar(null);
    }
    graph.container.focus();
  });

  graph.getTooltip = function (state) {
    const { cell } = state;
    if (cell.isEdge() && cell.value == null) {
      const source = this.getLabel(cell.getTerminal(true));
      const target = this.getLabel(cell.getTerminal(false));

      return `${source} -> ${target}`;
    }
    return this.getLabel(cell);
  };

  //Styling
  const style = graph.getStylesheet().getDefaultEdgeStyle();
  style.edgeStyle = constants.EDGESTYLE.ELBOW;
  delete style.endArrow;
  style.rounded = true;
  style.fontColor = "black";
  style.strokeColor = "black";

  connectionHandler = graph.getPlugin("ConnectionHandler");

  mxConnectionHandlerInsertEdge = connectionHandler.insertEdge;
  connectionHandler.insertEdge = (parent, id, value, source, target, style) => {
    //Do not allow boundary node - boundary node connection
    if (!("value" in source) || !("value" in target)) {
      return null;
    }
    if (source.value == null || target.value == null) {
      return null;
    }

    if (source.value["type"] == "out" && target.value["type"] == "out") {
      return null;
    }
    let bdryconnection = false;
    let nidx = {};
    let bid = Object.keys(activeNetworks).length + 1;
    let blabel = "Network " + bid;
    let etype = "in";
    if (source.value["type"] == "out" || target.value["type"] == "out") {
      bdryconnection = true;
      bid = boundaryNetworkID;
      while (document.getElementById("network" + bid) != undefined) {
        boundaryNetworkID -= 1;
        bid = boundaryNetworkID;
      }
      nidx["" + boundaryNetworkID] = 0.0;
      blabel = "Bdry Net " + -bid;
      activeNetworks[bid] = { type: "boundary", 
                              edges: [],
                              name: blabel,
                              id: bid,
                              dissipative: false
                            };
      boundaryNetworkID -= 1;
      //Update display datatable
      let newData = {
        headings : ["Type","Edges","Name","ID","Dissipative?","Select"],
        data : [[activeNetworks[bid].type,activeNetworks[bid].edges,activeNetworks[bid].name,activeNetworks[bid].id,activeNetworks[bid].dissipative,false]]
      }
      displayActiveNetworkDataTable.insert(newData);  
      configureActiveNetworksDataTable.insert(newData); 

      etype = "out";
    }
    let estyle = {
      fontColor: "red",
      fontSize: 6,
    };
    if (etype == "out") {
      estyle["strokeColor"] = "red";
    }
    let ede = graph.insertEdge(
      parent,
      edgeCounter,
      {
        label: "" + edgeCounter,
        weight: nidx,
        type: etype,
      },
      source,
      target,
      estyle
    );

    graphEdges[edgeCounter] = ede;
    edgeCounter += 1;
    return ede;
  };


  let undoManager = new UndoManager();

  const undoListener = function (sender, evt) {
    undoManager.undoableEditHappened(evt.getProperty("edit"));
  };

  // Installs the command history
  let listener = (sender, evt) => {
    undoListener(sender, evt);
  };

  graph.getDataModel().addListener(InternalEvent.UNDO, listener);
  graph.getView().addListener(InternalEvent.UNDO, listener);

  // Keeps the selection in sync with the history
  let undoHandler = function (sender, evt) {
    let cand = graph.getSelectionCellsForChanges(
      evt.getProperty("edit").changes,
      function (change) {
        // Only selects changes to the cell hierarchy
        return !(change instanceof ChildChange);
      }
    );

    if (cand.length > 0) {
      let model = graph.getDataModel();
      let cells = [];

      for (let i = 0; i < cand.length; i++) {
        if (graph.view.getState(cand[i]) != null) {
          cells.push(cand[i]);
        }
      }

      graph.setSelectionCells(cells);
    }
  };

  undoManager.addListener(InternalEvent.UNDO, undoHandler);
  undoManager.addListener(InternalEvent.REDO, undoHandler);

  // Stops editing on enter or escape keypress
  const keyHandler = new KeyHandler(graph);

  keyHandler.bindKey(46, (evt) => {
    if (graph.isEnabled()) {
      const dcells = graph.removeCells();
      for (let cell of dcells) {
        graph.view.clear(cell, true, false);
      }
    }
  });

  //Undo
  keyHandler.bindControlKey(90, (evt) => {
    if (graph.isEnabled()) {
      undoManager.undo();
    }
  });

  //Redo
  keyHandler.bindControlKey(89, (evt) => {
    if (graph.isEnabled()) {
      undoManager.redo();
    }
  });

  //Select All - A
  keyHandler.bindControlKey(65, (evt) => {
    if (graph.isEnabled()) {
      graph.selectAll();
    }
  });

  //Zoom in - Numpad +
  keyHandler.bindControlKey(107, (evt) => {
    if (graph.isEnabled()) {
      graph.zoomIn();
    }
  });

  //Zoom out - Numpad -
  keyHandler.bindControlKey(109, (evt) => {
    if (graph.isEnabled()) {
      graph.zoomOut();
    }
  });

  //Fit - Home key
  keyHandler.bindControlKey(36, (evt) => {
    if (graph.isEnabled()) {
      graph.fit();
    }
  });

  //Setup UI actions after the main divs are rendered
  document.getElementById("composeftu").addEventListener("click", function () {
    if(!pythonloaded){
      alert("Python modules have not been loaded! Wait for them to load and retry!");
    }
    //Update Active PHS just in case
    document.body.style.cursor = "progress";
    updateActivePHSInstance();
    //Just in case
    setNetworkComponents();
    document.getElementById("compositePHS").innerHTML = "";
    document.getElementById("compositemodelphs").innerHTML = "";
    document.getElementById("compositemodelphs").style.display='none';

    //Check if the phs classes are well defined
    const phsrows = document.getElementById("phslist").rows;
    //No header so start at 0
    for (var j = 0, jLen = phsrows.length; j < jLen; j++) {
      const phs = JSON.parse(phsrows[j].cells[0].children[0].dataset.init);
      if (!("u_split" in phs["phs"]["portHamiltonianMatrices"])) {
        document.body.style.cursor = "default";
        alert(
          "Input output network(s) for the PHS instance \n" +
            phsrows[j].cells[0].children[0].id +
            "\ndefined on its u components have not been provided.\n Complete to proceed."
        );
        return;
      }
    }
    
    // Check if all boundary networks have inputs provided
    for (const [key, value] of Object.entries(networkData)) {
      if(value['type']=='boundary'){
        if(!('input' in value)){
          document.body.style.cursor = "default";
          alert("Boundary network "+key+" does not have its input configutation defined!\n Complete to proceed.")
          return;
        }
      }
    }
    document.getElementById("composedPHSPython").innerText = "";
    document.getElementById("compositemodelphs").innerHTML = "";
    document.getElementById("symbolicphscodeblock").style.display = "none";
    document.getElementById("pythonicphscodeblock").style.display = "none";    

    composeUsingPython();

  });


  function clearGraph() {
    //Check if graph is empty or not
    let cselect = graph.getSelectionCell();
    graph.selectAll();
    let cells = graph.getSelectionCells();
    if (cells.length > 0 && documentChanged) {
      //Check for save as well
      if (
        confirm("Graph has not been saved! Do you wish to continue?") == false
      ) {
        graph.setSelectionCell(cselect);
        return false;
      }
    }
    const dcells = graph.removeCells();
    //https://github.com/maxGraph/maxGraph/issues/114#issuecomment-1312148372
    for (let cell of dcells) {
      graph.view.clear(cell, true, false);
    }
    //Reset
    graphNodes = {};
    graphEdges = {};
    activeNetworks = {};
    networkData = {};
    rows = 0;
    cols = 0;
    withBoundary = false;
    currentNodeOffset = 0;
    edgeCounter = 1;
    boundaryNetworkID = -1;
    usedOffsets = [0.0, 0.0];
    showEdgeLabels = true;
    activePHSwindowUpdated = false;
    activePHSwindow = null;
    activephsclasses = Object();
    phsClassColor = Object();
    activeNetworks = Object();
    networkData = Object();
    compositionErrors = Object();
    provenance = Object();
    //clear json
    document.getElementById("jsonTxt").value = "";
    document.getElementById("jview").textContent = "";

    //clear the phs class selection datalists
    document.getElementById("networkphsclassselection").innerHTML = "Select";
    document.getElementById("phslist").innerHTML = "";
    document.getElementById("phsMathML").innerHTML = "";
    document.getElementById("phsinstancename").innerHTML = "";
    document.getElementById("updatePHSInstance").style.display = "none";
    document.getElementById("savePHSInstanceToFile").style.display = "none";

    //Network information
    document.getElementById("networkid").innerHTML = "";
    document.getElementById("networkTxt").style.display = "none";
    //document.getElementById("networktype").checked = false;
    document.getElementById("internalnetworkdef").style.display = "none";
    document.getElementById("boundarynetworkdef").style.display = "none";

    //Other information
    document.getElementById("composedPHS").innerText = "";
    document.getElementById("composedPHSPython").innerText = "";    
    document.getElementById("compositePHS").innerHTML = "";
    document.getElementById("compositemodelphs").innerHTML = "";

    document.getElementById("symbolicphscodeblock").style.display = "none";
    document.getElementById("pythonicphscodeblock").style.display = "none";
    
    //Clear networks
    resetDisplayActiveNetworkDataTable();
    showStatusMessage("");
    return true;
  }

  document.getElementById("newdocument").addEventListener("click", function () {
    clearGraph();
    openTab("GraphicalEditor");
    document.getElementById("ftuEditor").style.background = "gray";
  });

  document
    .getElementById("loaddocument")
    .addEventListener("click", function () {
      if (clearGraph()) {
        document.getElementById("loadFTUJson").style.display = "block";
      }
    });

  document.getElementById("helpinfo").addEventListener("click", function () {
    document.getElementById("HelpInformation").style.display = "block";
  });

  document
    .getElementById("savedocument")
    .addEventListener("click", function () {
      if (provenance["projectname"] == undefined) {
        alert("Provenance information is missing!! Add and retry");
        return;
      }
      if (provenance["projectname"].length == 0) {
        alert("Provenance information is missing!! Add and retry");
        return;
      }
      let ctex = saveModel();
      try {
        document.body.style.cursor = "progress";
        document.getElementById("jsonTxt").value = ctex;
        //Decorate
        var jsonViewer = new JSONViewer();
        document.getElementById("jview").textContent = "";
        document.getElementById("jview").appendChild(jsonViewer.getContainer());
        jsonViewer.showJSON(JSON.parse(ctex));
        document.body.style.cursor = "default";
        alert("Json loaded in JSON tab");
      } finally {
        hideProgressPopup();
        document.body.style.cursor = "default";
      }
    });

  document.getElementById("zoomin").addEventListener("click", function () {
    graph.zoomIn();
  });

  document.getElementById("zoomout").addEventListener("click", function () {
    graph.zoomOut();
  });

  document.getElementById("zoomfit").addEventListener("click", function () {
    graph.fit();
  });

  document
    .getElementById("zoomoriginal")
    .addEventListener("click", function () {
      graph.zoomActual();
    });

  document.getElementById("bgimage").addEventListener("click", function () {
    document.getElementById("loadFTUImage").style.display = "block";
  });

  document
    .getElementById("selectednodes")
    .addEventListener("change", function (event) {
      //Triggered when user changes
      graph.clearSelection();
      selectCells();
    });

  document
    .getElementById("selectededges")
    .addEventListener("change", function (event) {
      graph.clearSelection();
      selectCells(false);
    });

    
    document.getElementById("setweight").addEventListener("click", function () {
      const networkid = parseFloat(
        document.getElementById("edgenetworkid").value.trim(),
        10
      );
      const weight = parseFloat(
        document.getElementById("edgeweight").value.trim(),
        10
      );
      const edges = document.getElementById("selectededges").value.trim();
      if (edges.length == 0) return;
      let eids = edges.split(",");
      for (let i = 0; i < eids.length; i++) {
        if ("weight" in graphEdges[parseInt(eids[i], 10)].value) {
          graphEdges[parseInt(eids[i], 10)].value["weight"]["" + networkid] =
            weight;
        } else {
          graphEdges[parseInt(eids[i], 10)].value["weight"] = {};
          graphEdges[parseInt(eids[i], 10)].value["weight"]["" + networkid] =
            weight;
        }
      }
      updateNetwork(networkid, eids); //Create network metadata
      if (eids.length == 1)
        updatePropertiesBar(graphEdges[parseInt(eids[0], 10)], true);
  
    });
  


  document.getElementById("removeweight").addEventListener("click", function () {
    const networkid = parseFloat(
      document.getElementById("edgenetworkid").value.trim(),
      10
    );
    const weight = parseFloat(
      document.getElementById("edgeweight").value.trim(),
      10
    );
    const edges = document.getElementById("selectededges").value.trim();
    if (edges.length == 0) return;
    let eids = edges.split(",");
    for (let i = 0; i < eids.length; i++) {
      if ("weight" in graphEdges[parseInt(eids[i], 10)].value) {
        let wt = graphEdges[parseInt(eids[i], 10)].value["weight"];
        delete wt["" + networkid];
        graphEdges[parseInt(eids[i], 10)].value["weight"] = wt;
      } 
    }
    updateNetwork(networkid, eids); //Create network metadata
    if (eids.length == 1)
      updatePropertiesBar(graphEdges[parseInt(eids[0], 10)], true);

  });

  document
    .getElementById("applylevelset")
    .addEventListener("click", function () {
      const lsexpr = document.getElementById("levelsetdesc").value.trim();
      if (lsexpr.length == 0) return;
      let cid = [];
      let noffset = 1;
      let x = 0;
      let y = 0;
      let i = noffset;
      let res = false;
      if (withBoundary) {
        for (let ix = 0; ix < rows; ix++) {
          x = ix;
          y = -1;
          i = noffset;
          res = eval(lsexpr);
          if (res) {
            cid.push(i);
          }

          y = cols;
          i = noffset + rows;
          res = eval(lsexpr);
          if (res) {
            cid.push(i);
          }
          noffset += 1;
        }
        noffset += rows - 1;
        for (let j = 0; j < cols; j++) {
          x = -1;
          y = j;
          noffset += 1;
          i = noffset;
          res = eval(lsexpr);
          if (res) {
            cid.push(i);
          }
          x = rows;
          i = noffset + rows * cols + cols;
          res = eval(lsexpr);
          if (res) {
            cid.push(i);
          }
        }
      }

      if (noffset == 1) noffset = 0;
      for (let ix = 0; ix < rows; ix++) {
        for (let j = 0; j < cols; j++) {
          noffset += 1;
          x = ix;
          y = j;
          i = noffset;
          res = eval(lsexpr);
          if (res) {
            cid.push(i);
          }
        }
      }
      //Handle nodes created by hand
      for (const key in graphNodes) {
          i = key;
          res = eval(lsexpr);
          if (res) {
            cid.push(i);
          }
          console.log(i,key,graphNodes[key])
      }
      cid = cid.filter((value, index, array) => array.indexOf(value) === index);
      cid.sort();
      document.getElementById("selectednodes").value = cid.join(",");
      selectCells();
    });

  document
    .getElementById("applyedgelevelset")
    .addEventListener("click", function () {
      const lsexpr = document.getElementById("levelsetedgedesc").value.trim();
      if (lsexpr.length == 0) return;

      let res = false;
      let cid = [];
      const eks = Object.keys(graphEdges);
      for (let ix = 0; ix < eks.length; ix++) {
        let i = eks[ix];
        res = eval(lsexpr);
        if (res) {
          cid.push(i);
        }
      }
      cid.sort();
      document.getElementById("selectededges").value = cid.join(",");
      selectCells(false);
    });

    //Ensure definition is available globally
    window.setSelectedPHSClass = function(phsclass){
      if (
        phsclass != "" &&
        document.getElementById("selectednodes").value.trim().length != 0
      ) {
        let sid = document
          .getElementById("selectednodes")
          .value.trim()
          .split(",");        
        for (let i = 0; i < sid.length; i++) {
          let dx = graphNodes[parseInt(sid[i], 10)];
          dx.value["phs"] = phsclass;
          if (dx.id == currentFTUElement) {
            document.getElementById("currentElementPHSclass").innerText =
              phsclass;
          }
          styleUtils.setCellStyles(
            graph.model,
            [dx],
            "fillColor",
            phsClassColor[phsclass]
          );
          graph.refresh(dx);
        }
      }
      document.getElementById("showPHSList").style.display = 'none';
    }
    

  document
    .getElementById("setnodeclass")
    .addEventListener("click", function () {
      let phsdata = getPHSData();

      let phshtml = `<h3>List of PHS classes</h3><br><div style="display: flex;justify-content: center;"><table style="align-self: center;">`;
      let ctr=0;
      for(const val in phsdata){
        ctr +=1;
        phshtml += `<tr><td><button onmousedown="setSelectedPHSClass('${val}')">${val}</button></td></tr>`
      }
      phshtml += `</table></div>`;
      if(ctr>0){
        document.getElementById("showPHSListtable").innerHTML = phshtml;
        document.getElementById("showPHSList").style.display = 'block';
      }else{
        document.getElementById("showPHSListtable").innerHTML = '';
        document.getElementById("showPHSList").style.display = 'none';
        alert("No PHS classes have been loaded!");
      }

    });

  document
    .getElementById("generategraph")
    .addEventListener("click", function () {
      rows = parseInt(document.getElementById("numrows").value, 10);
      cols = parseInt(document.getElementById("numcols").value, 10);
      let append2existing =
        document.getElementById("saveexistingnodes").checked;
      if (!append2existing) {
        graph.selectAll();
        const dcells = graph.removeCells();
        for (let cell of dcells) {
          graph.view.clear(cell, true, false);
        }
        currentNodeOffset = 0;
        edgeCounter = 1;
        usedOffsets = [0.0, 0.0];
      }
      graphNodes = Object();
      const triangulation = document.getElementById("triangulatedmesh").checked;
      const iw = 50;
      const jw = 50;
      //Use Object.assign to create copies of the styles, else all cells share the same style instance
      //Changes for one cell will be applied to all
      const rstyle = {
        shape: "rectangle",
        fillColor: "rgb(195, 217, 255)",
        strokeColor: "transparent",
        fontSize: 8,
        fontStyle: 1,
        fontColor: "black",
        resizable: 0,
      };
      const bstyle = {
        shape: "ellipse",
        fillColor: "rgb(217, 195, 255)",
        strokeColor: "transparent",
        fontSize: 8,
        fontStyle: 1,
        fontColor: "black",
        resizable: 0,
      };
      const parent = graph.getDefaultParent();

      graph.stopEditing(false);
      let ixmap = Object();
      let nodeCoords = []; //For Delaunay if triangulation is requested
      let nodeCoordsMap = [];//For Delaunay if triangulation is requested
      let bnodeOffsetStart = -1;
      let bnodeOffsetEnd = -1;
      let noffset = 1;
      if (append2existing) {
        noffset = currentNodeOffset;
      }
      //Add boundary nodes
      withBoundary = document.getElementById("withboundarynodes").checked;
      let boundaryNodes = [];
      let boundaryNodesMap = Object();
      let xoffset = usedOffsets[0];
      let yoffset = usedOffsets[1];
      if (withBoundary) {
        bnodeOffsetStart = noffset;
        for (let i = 0; i < rows; i++) {
          let j = -1;
          ixmap[i + "," + j] = noffset;
          let gn = graph.insertVertex({
            parent,
            id: noffset,
            position: [iw * (i + 2) + xoffset, jw * (j + 2) + yoffset],
            size: [15, 15],
            style: Object.assign({}, bstyle),
            value: {
              type: "out",
              label: "" + noffset,
            },
          });
          boundaryNodes.push(noffset);
          boundaryNodesMap[noffset] = [i , j, 1];
          graphNodes[noffset] = gn;
          j = cols;
          //noffset += 1;
          ixmap[i + "," + j] = noffset + rows;
          gn = graph.insertVertex({
            parent,
            id: noffset + rows,
            position: [iw * (i + 2) + xoffset, jw * (j + 2) + yoffset],
            size: [15, 15],
            style: Object.assign({}, bstyle),
            value: {
              type: "out",
              label: "" + (noffset + rows),
            },
          });
          boundaryNodes.push(noffset + rows);
          boundaryNodesMap[noffset + rows] = [i , j, 2];
          graphNodes[noffset + rows] = gn;
          noffset += 1;
        }
        noffset += rows - 1;
        for (let j = 0; j < cols; j++) {
          let i = -1;
          noffset += 1;
          ixmap[i + "," + j] = noffset;
          let gn = graph.insertVertex({
            parent,
            id: noffset,
            position: [iw * (i + 2) + xoffset, jw * (j + 2) + yoffset],
            size: [15, 15],
            style: Object.assign({}, bstyle),
            value: {
              type: "out",
              label: "" + noffset,
            },
          });
          boundaryNodes.push(noffset);
          boundaryNodesMap[noffset] = [i , j, 3];
          graphNodes[noffset] = gn;
          i = rows;
          ixmap[i + "," + j] = noffset + rows * cols + cols;
          gn = graph.insertVertex({
            parent,
            id: noffset + rows * cols + cols,
            position: [iw * (i + 2) + xoffset, jw * (j + 2) + yoffset],
            size: [15, 15],
            style: Object.assign({}, bstyle),
            value: {
              type: "out",
              label: "" + (noffset + rows * cols + cols),
            },
          });
          boundaryNodes.push(noffset + rows * cols + cols);
          boundaryNodesMap[noffset + rows * cols + cols] = [i , j, 4];
          graphNodes[noffset + rows * cols + cols] = gn;
        }
        usedOffsets[0] = iw * (rows + 2) + xoffset;
        usedOffsets[1] = jw * (cols + 2) + yoffset;
        currentNodeOffset = noffset + rows * cols + cols + 1;
        bnodeOffsetEnd = noffset;
      }
      if (noffset == 1) noffset = 0;

      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          noffset += 1;
          ixmap[i + "," + j] = noffset;
          let gn = graph.insertVertex({
            parent,
            id: noffset,
            position: [iw * (i + 2) + xoffset, jw * (j + 2) + yoffset],
            size: [15, 15],
            style: Object.assign({}, rstyle),
            value: {
              type: "in",
              label: "" + noffset,
            },
          });
          graphNodes[noffset] = gn;
          nodeCoords.push([iw * (i + 2) + xoffset,jw * (j + 2) + yoffset]);
          nodeCoordsMap.push(i + "," + j)
        }
      }
      if (!append2existing) {
        usedOffsets[0] = iw * (rows + 1) + xoffset;
        usedOffsets[1] = jw * (cols + 1) + yoffset;
      }
      if (!withBoundary) {
        currentNodeOffset = noffset + 1;
      }

      let existingEdges = Object();
      //Check if regular lattice or triangulation is requested
      //Create edges
      
      if(!triangulation){
        for (let i = 0; i < rows; i++) {
          for (let j = 0; j < cols; j++) {
            let ixs = [
              i - 1 + "," + j,
              i + "," + (j + 1),
              i + 1 + "," + j,
              i + "," + (j - 1),
            ];
            for (let s = 0; s < ixs.length; s++) {
              if (ixs[s] in ixmap) {
                if (!(i + "," + j + "_" + ixs[s] in existingEdges)) {
                  existingEdges[i + "," + j + "_" + ixs[s]] = true;
                  existingEdges[ixs[s] + "_" + i + "," + j] = true;
                  const sourceNode = graphNodes[ixmap[i + "," + j]];
                  const targetNode = graphNodes[ixmap[ixs[s]]];
                  const sid = parseInt(sourceNode.value["label"], 10);
                  const tid = parseInt(targetNode.value["label"], 10);
                  let etype = "in";
                  let ed = graph.insertEdge(
                    parent,
                    i + "," + j + "->" + ixs[s],
                    {
                      label: "" + edgeCounter,
                      type: etype,
                    },
                    sourceNode,
                    targetNode,
                    {
                      fontColor: "red",
                      fontSize: 6,
                    }
                  );
                  if (
                    boundaryNodes.indexOf(sid) < 0 &&
                    boundaryNodes.indexOf(tid) < 0
                  ) {
                    ed.value = {
                      label: "" + edgeCounter,
                      type: etype,
                    };
                  } else {
                    ed.value = {
                      label: "" + edgeCounter,
                      type: "out",
                      weight: {},
                    };
                    ed.style["strokeColor"] = "red";
                    graph.refresh(ed);
                    let bid = -sid;
                    if (boundaryNodes.indexOf(tid) > -1) {
                      bid = -tid;
                    }
                    ed.value["weight"]["" + bid] = -bid;
                    if (boundaryNetworkID > bid) {
                      boundaryNetworkID = bid;
                    }
                    let blabel = "Bdry Net " + -bid;

                    activeNetworks[bid] = {
                      type: "boundary",
                      edges: [edgeCounter],
                      name: blabel,
                      id: bid,
                      dissipative: false
                    };
                  }
                  //Label offset
                  let xoff = Math.abs(
                    sourceNode.geometry._x - targetNode.geometry._x
                  );
                  if (xoff < 1) ed.geometry.offset = new Point(5, 0);
                  else ed.geometry.offset = new Point(0, 5);
                  graphEdges[edgeCounter] = ed;
                  edgeCounter += 1;
                }
              }
            }
          }
        }
      }else{
        const delaunay = Delaunator.from(nodeCoords);
        for (let e = 0; e < delaunay.triangles.length; e++) {
          if (e > delaunay.halfedges[e]) {
            const p = delaunay.triangles[e];
            //function nextHalfedge(e) { return (e % 3 === 2) ? e - 2 : e + 1; }            
            const q = delaunay.triangles[(e % 3 === 2) ? e - 2 : e + 1];
            const edgeID = nodeCoordsMap[p]+"_"+nodeCoordsMap[q];
            if (!(edgeID in existingEdges)) {
              existingEdges[edgeID] = true;
              existingEdges[nodeCoordsMap[q]+"_"+nodeCoordsMap[p]] = true;
              const sourceNode = graphNodes[ixmap[nodeCoordsMap[p]]];
              const targetNode = graphNodes[ixmap[nodeCoordsMap[q]]];
              const sid = parseInt(sourceNode.value["label"], 10);
              const tid = parseInt(targetNode.value["label"], 10);
              let etype = "in";
              let ed = graph.insertEdge(
                parent,
                nodeCoordsMap[p] + "->" + nodeCoordsMap[q],
                {
                  label: "" + edgeCounter,
                  type: etype,
                },
                sourceNode,
                targetNode,
                {
                  fontColor: "red",
                  fontSize: 6,
                  curved: false
                }
              );

              //Label offset
              let xoff = Math.abs(
                sourceNode.geometry._x - targetNode.geometry._x
              );
              if (xoff < 1) ed.geometry.offset = new Point(5, 0);
              else ed.geometry.offset = new Point(0, 5);
              //ed.style.curved=false;
              graphEdges[edgeCounter] = ed;
              edgeCounter += 1;
            }
          }
        }
        //Do the boundary edges
        if (withBoundary) {
          for (const [key, value] of Object.entries(boundaryNodesMap)) {
            const bnode = value[0]+","+value[1];
            const direction = value[2];
            let tnode = null;
            if(direction==1){
                tnode = value[0] + ",0";
            }else if(direction==2){
              tnode = value[0] + "," + (cols-1);
            }else if(direction==3){
              tnode = "0," + value[1];
            }else if(direction==4){
              tnode = (rows-1) + "," + value[1];
            } 
            const edgeID = bnode+"_"+tnode;
            if (!(edgeID in existingEdges)) {
              existingEdges[edgeID] = true;
              existingEdges[tnode+"_"+bnode] = true;
              const sourceNode = graphNodes[ixmap[bnode]];
              const targetNode = graphNodes[ixmap[tnode]];
              const sid = parseInt(sourceNode.value["label"], 10);
              const tid = parseInt(targetNode.value["label"], 10);
              let etype = "out";
              let ed = graph.insertEdge(
                parent,
                bnode + "->" + tnode,
                {
                  label: "" + edgeCounter,
                  type: etype,
                  weight: {},
                },
                sourceNode,
                targetNode,
                {
                  fontColor: "red",
                  fontSize: 6,
                  strokeColor: "red"
                }
              );
              // ed.value = {
              //   label: "" + edgeCounter,
              //   type: "out",
              //   weight: {},
              // };
              // ed.style["strokeColor"] = "red";
              // graph.refresh(ed);
              let bid = -sid;
              ed.value["weight"]["" + bid] = -bid;
              if (boundaryNetworkID > bid) {
                boundaryNetworkID = bid;
              }
              let blabel = "Bdry Net " + -bid;

              activeNetworks[bid] = {
                type: "boundary",
                edges: [edgeCounter],
                name: blabel,
                id: bid,
                dissipative: false
              };
        //Label offset
              let xoff = Math.abs(
                sourceNode.geometry._x - targetNode.geometry._x
              );
              if (xoff < 1) ed.geometry.offset = new Point(5, 0);
              else ed.geometry.offset = new Point(0, 5);
              ed.style.curved=false;
              graphEdges[edgeCounter] = ed;
              edgeCounter += 1;
            }
          }
        }        
      }
      //Reload the table
      resetDisplayActiveNetworkDataTable();
      reloadDisplayActiveNetworkDataTable();

      graph.stopEditing(true);
      graph.fit();
      graph.container.focus();
  });

  document
    .getElementById("saveNetworkConfigBtn")
    .addEventListener("click", function () {
      setNetworkComponents();
    });

  document
    .getElementById("saveCompositionBtn")
    .addEventListener("click", function () {
      const cphs = document.getElementById("composedPHS").innerText;
      try {
        document.body.style.cursor = "progress";
        showProgressPopup();
        if (cphs.length > 0) {
          if (provenance["projectname"] == undefined) {
            alert(
              "Provenance information is missing. Project name is required"
            );
            return;
          }
          if (provenance["projectname"].length == 0) {
            alert(
              "Provenance information is missing. Project name is required"
            );
            return;
          }
          let phs = JSON.parse(cphs);
          if ("composition" in phs) {
            phs = phs["composition"];
          }
          let ctex = JSON.parse(saveModel());
          const result = { graph: ctex, composition: phs };
          document.getElementById("composedPHS").innerText =
            JSON.stringify(result);
          let filename = provenance["projectname"] + "composite.json";
          saveTextArea(filename.replaceAll(" ", "_"), "composedPHS");
        }
      } finally {
        document.body.style.cursor = "default";
      }
    });

    document
    .getElementById("exportCompositionCodeBtn")
    .addEventListener("click", function () {
      const cphs = document.getElementById("composedPHSPython").value.trim();
      try {
        document.body.style.cursor = "progress";
        showProgressPopup();
        if (cphs.length > 0) {
          if (provenance["projectname"] == undefined) {
            alert(
              "Provenance information is missing. Project name is required"
            );
            return;
          }
          if (provenance["projectname"].length == 0) {
            alert(
              "Provenance information is missing. Project name is required"
            );
            return;
          }
          let filename = provenance["projectname"] + ".py";
          saveTextArea(filename.replaceAll(" ", "_"), "composedPHSPython");
        }
      } finally {
        hideProgressPopup();
        document.body.style.cursor = "default";
      }
    });



  document
    .getElementById("saveprojectBtn")
    .addEventListener("click", function () {
      if (provenance["projectname"] == undefined) {
        alert("Provenance information is missing. Project name is required");
        return;
      }
      if (provenance["projectname"].length == 0) {
        alert("Provenance information is missing. Project name is required");
        return;
      }

      let filename = provenance["projectname"] + ".json";
      saveTextArea(filename.replaceAll(" ", "_"), "jsonTxt");
    });

  document
    .getElementById("projectproperties")
    .addEventListener("click", function () {
      document.getElementById("projectname").value =
        "projectname" in provenance ? provenance["projectname"] : "";
      document.getElementById("projectAuthor").value =
        "authors" in provenance ? provenance["authors"] : "";
      document.getElementById("projectdescription").innerText =
        "description" in provenance ? provenance["description"] : "";
      document.getElementById("ProjectProperties").style.display = "block";
      document.getElementById("projectnameheader").innerHTML =
        "<b>Project Name: " +
        document.getElementById("projectname").value +
        "</b>";
    });

  document.getElementById("connectnode").addEventListener("click", function () {
    let v = document.getElementById("connectnodeid").value.trim();
    let sid = document.getElementById("selectednodes").value.trim().split(",");
    if (
      v.length == 0 ||
      document.getElementById("selectednodes").value.trim().length == 0
    ) {
      return;
    }
    let bdryconnection = false;
    if (graphNodes[parseInt(v, 10)].value["type"] == "out") {
      bdryconnection = true;
    }
    if (!bdryconnection) {
      bdryconnection = true;
      for (let s = 0; s < sid.length; s++) {
        bdryconnection =
          bdryconnection &&
          graphNodes[parseInt(sid[s], 10)].value["type"] == "out";
        if (bdryconnection == false) break;
      }
    }
    let nd = graphNodes[parseInt(v, 10)];
    let nidx = {};
    let bid = Object.keys(activeNetworks).length + 1;
    let blabel = "Network " + bid;
    if (bdryconnection) {
      bid = boundaryNetworkID;
      while (document.getElementById("network" + bid) != undefined) {
        boundaryNetworkID -= 1;
        bid = boundaryNetworkID;
      }

      nidx["" + boundaryNetworkID] = 0.0;
      blabel = "Bdry Net " + -bid;
      activeNetworks[bid] = { type: "boundary", edges: [], name: blabel, id: bid,dissipative: false };
      boundaryNetworkID -= 1;
    } else {
      activeNetworks[bid] = { type: "generic", edges: [], name: blabel, id: bid,dissipative: false };
    }
    //Update display datatable
    let newData = {
      headings : ["Type","Edges","Name","ID","Dissipative?","Select"],
      data : [[activeNetworks[bid].type,activeNetworks[bid].edges,activeNetworks[bid].name,activeNetworks[bid].id,activeNetworks[bid].dissipative,false]]
    }
    displayActiveNetworkDataTable.insert(newData);  
    configureActiveNetworksDataTable.insert(newData); 

    const parent = graph.getDefaultParent();
    if (nd.value["type"] == "in") {
        for (let s = 0; s < sid.length; s++) {
          let dx = graphNodes[parseInt(sid[s], 10)];
          let etype = "in";
          let estyle = {
            fontColor: "red",
            fontSize: 6,
          };
          estyle["strokeColor"] = bdryconnection?"red":"black";
          if (dx.value.type == "out") etype = "out";
          let ed = graph.insertEdge(
            parent,
            sid[s] + "->" + v,
            {
              label: "" + edgeCounter,
              type: etype,
              weight: nidx,
            },
            dx,
            nd,
            estyle
          );
          graphEdges[edgeCounter] = ed;
          activeNetworks[bid]["edges"].push(edgeCounter);
          edgeCounter += 1;
          let xoff = Math.abs(dx.geometry._x - nd.geometry._x);
          if (xoff < 1) ed.geometry.offset = new Point(5, 0);
          else ed.geometry.offset = new Point(0, 5);
        }
      
    } else {
        for (let s = 0; s < sid.length; s++) {
          let dx = graphNodes[parseInt(sid[s], 10)];
          if (dx.value["type"] == "in") {
            let ed = graph.insertEdge(
              parent,
              sid[s] + "->" + v,
              {
                label: "" + edgeCounter,
                type: "out",
                weight: nidx,
              },
              dx,
              nd,
              {
                fontColor: "red",
                strokeColor: "red",
                fontSize: 6,
              }
            );
            graphEdges[edgeCounter] = ed;
            activeNetworks[bid]["edges"].push(edgeCounter);
            edgeCounter += 1;
            let xoff = Math.abs(dx.geometry._x - nd.geometry._x);
            if (xoff < 1) ed.geometry.offset = new Point(5, 0);
            else ed.geometry.offset = new Point(0, 5);
          }
        }
    }
    document.getElementById("connectnodeid").value = "";
  });

  document
    .getElementById("loadProjectImageFile")
    .addEventListener("click", function () {
      try {
        var file = document.getElementById("projectimagefile").files[0];
        if (file) {
          handleDrop(graph, file, 0, 0);
        }
        document.getElementById("loadFTUImage").style.display = "none";
      } catch (err) {
        alert("Failed to load background image\n" + err);
      }
    });

  document
    .getElementById("loadProjectFile")
    .addEventListener("click", function () {
      let file = document.getElementById("projectfile").files[0];
      if (file) {
        try {
          let cselect = graph.getSelectionCell();
          graph.selectAll();
          let cells = graph.getSelectionCells();
          if (cells.length > 0 && documentChanged) {
            //Check for save as well
            if (
              confirm("Graph has not been saved! Do you wish to continue?") ==
              false
            ) {
              graph.setSelectionCell(cselect);
              return;
            }
          }
          const dcells = graph.removeCells();
          for (let cell of dcells) {
            graph.view.clear(cell, true, false);
          }
        } catch (e) {}
        currentNodeOffset = 0;
        edgeCounter = 1;
        boundaryNetworkID = -1;
        usedOffsets = [0.0, 0.0];
        activephsclasses = Object();
        phsClassColor = Object();
        activeNetworks = Object();
        networkData = Object();
        compositionErrors = Object();
        activePHSwindowUpdated = false;
        activePHSwindow = null;

        //Clear inputs
        document.getElementById("selectednodes").value = "";
        document.getElementById("selectededges").value = "";
        document.getElementById("connectnodeid").value = "";
        document.getElementById("networkselection").value = "";
        document.getElementById("phslist").innerHTML = "";

        var reader = new FileReader();
        reader.onload = function (e) {
          var textArea = document.getElementById("jsonTxt");
          textArea.value = e.target.result;
          currentFTUElement = "";
          document.getElementById("PropertiesContent").style.display = "none";

          try {
            document.body.style.cursor = "progress";
            const jsonObj = JSON.parse(e.target.result);
            var jsonViewer = new JSONViewer();
            document.getElementById("jview").textContent = "";
            document
              .getElementById("jview")
              .appendChild(jsonViewer.getContainer());
            jsonViewer.showJSON(jsonObj);
            //Switch to editor window
            openTab("GraphicalEditor");
            //Change button colour to show it has been selected
            document.getElementById("ftuEditor").style.backgroundColor = "gray";
            loadModel(textArea.value);
            document.getElementById("loadFTUJson").style.display = "none";
            document.getElementById("loadFTUImage").style.display = "none";
            document.getElementById("createFTUJson").style.display = "none";
          } catch (err) {
            let errm = err.message;
            if (errm.indexOf("Invalid width") < 0) {
              //Clear every thing that has been loaded
              graph.selectAll();
              let cells = graph.getSelectionCells();
              const dcells = graph.removeCells();
              //https://github.com/maxGraph/maxGraph/issues/114#issuecomment-1312148372
              for (let cell of dcells) {
                graph.view.clear(cell, true, false);
              }
              //Reset
              provenance = Object();
              documentChanged = false;
              currentNodeOffset = 0;
              edgeCounter = 1;
              usedOffsets = [0.0, 0.0];
              alert("Failed to parse selected file");
            } else {
              document.getElementById("loadBGJson").style.display = "none";
            }
          } finally {
            document.body.style.cursor = "default";
          }
        };
        reader.readAsText(file);
      }
    });

  //Bindings for handling phs table actions
  document.querySelector("body").addEventListener(
    "click",
    function (evt) {
      // Do some check on target
      if (evt.target.classList.contains("phsinstance")) {
        showphsinstance(evt.target);
      } else if (evt.target.classList.contains("phsduplicate")) {
        duplicatephsinstance(evt.target);
      } else if (evt.target.classList.contains("phsdelete")) {
        deletephsinstance(evt.target);
      }
    },
    true
  ); // Use Capturing

  phsLatexGen = new PHSLatexGenerator(document.getElementById("phsMathML"));

  document
    .getElementById("createPHSBtn")
    .addEventListener("click", function () {
      document
        .getElementById("statevector")
        .classList.remove("incorrectvalue-border");
      document
        .getElementById("hamiltonian")
        .classList.remove("incorrectvalue-border");
      document
        .getElementById("hamiltonianderivatives")
        .classList.remove("incorrectvalue-border");
      document
        .getElementById("JMatrix")
        .classList.remove("incorrectvalue-border");
      document
        .getElementById("RMatrix")
        .classList.remove("incorrectvalue-border");
      document
        .getElementById("BMatrix")
        .classList.remove("incorrectvalue-border");
      document
        .getElementById("EMatrix")
        .classList.remove("incorrectvalue-border");
      document
        .getElementById("QMatrix")
        .classList.remove("incorrectvalue-border");
      document.getElementById("createFTUJson").style.display = "block";
    });

  document
    .getElementById("createPHSJSON")
    .addEventListener("click", function () {
      getPHSFromUserInput();
    });

  document.getElementById("loadPHS").addEventListener("click", function () {
    var file = document.getElementById("phscellmlfile").files[0];
    if (file == undefined) {
      let opt = document.getElementById("FromPMRFiles").value;
      if (opt == "FitzHugh Nagumo") {
        let phsjsonstring =
          '{"phs":{"Hderivatives":{"cols":1,"elements":["p/L","q/C"],"rows":2},"hamiltonian":"(1/2)(1/C)q^2+(1/2)(1/L)p^2","hamiltonianLatex":"\\\\left(\\\\frac{1}{2}\\\\right)\\\\frac{q^2}{C}+\\\\left(\\\\frac{1}{2}\\\\right)\\\\frac{p^2}{L}","parameter_values":{"C":{"value":"0.5773","units":"dimensionless"},"L":{"value":"1.7320","units":"dimensionless"},"M":{"value":"p*p*p-3*p","units":"dimensionless"},"r":{"value":"6","units":"dimensionless"}},"portHamiltonianMatrices":{"matB":{"cols":2,"elements":["1","0","0","1"],"rows":2},"matE":{"cols":2,"elements":["1","0","0","1"],"rows":2},"matJ":{"cols":2,"elements":["0","-1","1","0"],"rows":2},"matQ":{"cols":2,"elements":["1/L","0","0","1/C"],"rows":2},"matR":{"cols":2,"elements":["M","0","0","1/r"],"rows":2},"u":{"cols":1,"elements":["u","i"],"rows":2},"u_orientation":{"cols":1,"elements":[true,true],"rows":2}},"stateVector":{"cols":1,"elements":["p","q"],"rows":2}, "state_values":{"p":{"value":"0.5","units":"dimensionless"},"q":{"value":"0.5","units":"dimensionless"}},"success":true}}';
        try {
          //Check if file is cellml or json
          document.body.style.cursor = "progress";
          showProgressPopup();
          const jsonObj = JSON.parse(phsjsonstring);

          loadPHSTable("FitzHughNagumo", jsonObj);
          //Setup new color for next one
          phscolorpickerparent.style.background = generateColor();
        } catch (err) {
          activePHSwindow = null;
          let errm = err.message;
          document.getElementById("phsMathML").innerHTML = "";
          document.getElementById("phsinstancename").innerHTML = "";
          document.getElementById("updatePHSInstance").style.display = "none";
          document.getElementById("savePHSInstanceToFile").style.display =
            "none";
          alert("Failed to parse selected file");
        } finally {
          document.body.style.cursor = "default";
          document.getElementById("loadPHSDialog").style.display = "none";
          document.getElementById("showPHSList").style.display = "none";
          document.getElementById("HelpInformation").style.display = "none";
          document.getElementById("loadProjectImageFile").style.display =
            "none";
          document.getElementById("createFTUJson").style.display = "none";
          hideProgressPopup();
        }
      }
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        //Check if file is cellml or json
        document.body.style.cursor = "progress";
        showProgressPopup();
        const jsonObj = JSON.parse(e.target.result);
        let fname = file.name;
        if (fname.lastIndexOf(".") > -1) {
          fname = fname.substring(0, fname.lastIndexOf("."));
        }
        loadPHSTable(fname, jsonObj, e.target.result);
        //Setup new color for next one
        phscolorpickerparent.style.background = generateColor();
      } catch (err) {
        activePHSwindow = null;
        let errm = err.message;
        document.getElementById("phsMathML").innerHTML = "";
        document.getElementById("phsinstancename").innerHTML = "";
        document.getElementById("updatePHSInstance").style.display = "none";
        document.getElementById("savePHSInstanceToFile").style.display = "none";
        alert("Failed to parse selected file");
      } finally {
        document.body.style.cursor = "default";
        document.getElementById("loadPHSDialog").style.display = "none";
        document.getElementById("showPHSList").style.display = "none";
        document.getElementById("HelpInformation").style.display = "none";
        document.getElementById("loadProjectImageFile").style.display = "none";
        document.getElementById("createFTUJson").style.display = "none";
        hideProgressPopup();
      }
    };
    reader.readAsText(file);
  });

  document
    .getElementById("updatePHSInstance")
    .addEventListener("click", function (evt) {
      activePHSwindowUpdated = false; //Force update
      updateActivePHSInstance();
    });

  document
    .getElementById("savePHSInstanceToFile")
    .addEventListener("click", function (evt) {
      activePHSwindowUpdated = false; //Force update
      savephsinstance({ id: activePHSwindow + ".json" }); //activePHSwindow has the element id
    });

  // When the user clicks on the button save provenance
  document
    .getElementById("updateProvanence")
    .addEventListener("click", function () {
      provenance["projectname"] = document.getElementById("projectname").value;
      document.getElementById("projectnameheader").innerHTML =
        "<b>Project Name: " +
        document.getElementById("projectname").value +
        "</b>";
      provenance["authors"] = document.getElementById("projectAuthor").value;
      provenance["description"] =
        document.getElementById("projectdescription").value;
      if (document.getElementById("jsonTxt").value.trim().length > 0) {
        let ctex = JSON.parse(document.getElementById("jsonTxt").value);
        ctex["Provenance"] = provenance;
        document.getElementById("jsonTxt").value = JSON.stringify(
          ctex,
          null,
          2
        );
        //Decorate
        var jsonViewer = new JSONViewer();
        document.getElementById("jview").textContent = "";
        document.getElementById("jview").appendChild(jsonViewer.getContainer());
        jsonViewer.showJSON(ctex);
      }
      document.getElementById("ProjectProperties").style.display = "none";
    });

  document
    .addEventListener("networkselectedforconfiguration", function (event) {
      let txt = document.getElementById("networkselection").value.trim();
      const nid = document.getElementById("networkid").innerHTML.trim();
      if(!event.detail && nid!='Multiple'){
        document.getElementById("networkid").innerHTML = "";
        document.getElementById("networkid").dataset.init = '';
        document.getElementById("networkTxt").style.display = "none";
        document.getElementById("boundarynetworkdef").style.display = "none";
        document.getElementById("internalnetworkdef").style.display = "none";        
        return;
      }      
      const nids = txt.split(",");

      //Handle existing and save their selection data
      const enids = document.getElementById("networkid").dataset.init.split(',');
      const phsclass = document.getElementById("networkphsclassselection").innerText;
      let definedcomponents = [];
      if(phsclass!="Select"){
        const utable = document.getElementById("networkphsclassinputunames").rows;
        
        for (var j = 0, jLen = utable.length; j < jLen; j++) {
          definedcomponents.push(utable[j].cells[0].children[0].checked);
        }
      }
      //Dont do this as all selected elements will be affected

      document.getElementById("networkphsclassselection").innerText = 'Select';
      document.getElementById("networkphsclassinputunames").innerHTML = '';
      if(nids.length>0){
        if (nids.length > 1) {
          document.getElementById("networkid").innerHTML = "Multiple";
          document.getElementById("networkid").dataset.init = txt;
          document.getElementById("networkphsclassinputunames").innerHTML = "";
        } else {
          if(nids[0].length==0)
            return;
          document.getElementById("networkid").innerHTML = activeNetworks[nids[0]].name; //"network" + nids[0];
          document.getElementById("networkid").dataset.init = txt;
          //Set PHS information
          const id = parseInt(nids[0],10);
          if(id in networkData){
            if('input' in networkData[id]){
              const phsclass = networkData[id]['input']['phsclass'];
              const definedcomponents = networkData[id]['input']['components'];
              document.getElementById("networkphsclassselection").innerText = phsclass;
              if (phsclass in activephsclasses) {
                const utable = document.getElementById("networkphsclassinputunames");
                const unames =
                  activephsclasses[phsclass]["phs"]["portHamiltonianMatrices"]["u"][
                    "elements"
                  ];
                utable.innerHTML = "";
                let uc = 0;
                for (const ui in unames) {
                  const irow = utable.insertRow(-1);
                  let cs = irow.insertCell(-1);
                  let ck = definedcomponents[uc]?"checked":"";
                  cs.innerHTML = `<input type="radio" id="${phsclass}%${unames[ui]}" name="${phsclass}" ${ck}> <label for="${phsclass}%${unames[ui]}">${unames[ui]}</label>`;
                  uc +=1;
                }
              }
            }
          }
        }
        document.getElementById("networkTxt").style.display = "block";
        document.getElementById("boundarynetworkdef").style.display = "none";
        document.getElementById("internalnetworkdef").style.display = "none";

        //Check if all nids are boundary, if so show mapping
        let bdry = true;
        for (const n in nids) {
          if (nids[n][0] != "-") {
            bdry = false;
            break;
          }
        }
        if (bdry) {
          document.getElementById("boundarynetworkdef").style.display = "block";
        }else{
          document.getElementById("internalnetworkdef").style.display = "block";
        }
      }
    });

  //Trigged when networkphsclass is selected in the network configuration window
  document
    .getElementById("networkphsclassselection")
    .addEventListener("click", function (event) {
      let phsdata = getPHSData();
      let phshtml = `<h3>List of PHS classes</h3><br><div style="display: flex;justify-content: center;"><table style="align-self: center;">`;
      let ctr=0;
      for(const val in phsdata){
        ctr +=1;
        phshtml += `<tr><td><button onmousedown="setSelectedPHSClassForNetwork('${val}')">${val}</button></td></tr>`
      }
      phshtml += `</table></div>`;
      if(ctr>0){
        document.getElementById("showPHSListtable").innerHTML = phshtml;
        document.getElementById("showPHSList").style.display = 'block';
      }else{
        document.getElementById("showPHSListtable").innerHTML = '';
        document.getElementById("showPHSList").style.display = 'none';
        alert("No PHS classes have been loaded!");
      }

    });

  window.setSelectedPHSClassForNetwork = function (phsclass) {
      document.getElementById("networkphsclassselection").innerText = phsclass;
      if (phsclass in activephsclasses) {
        const utable = document.getElementById("networkphsclassinputunames");
        const unames =
          activephsclasses[phsclass]["phs"]["portHamiltonianMatrices"]["u"][
            "elements"
          ];
        utable.innerHTML = "";
        for (const ui in unames) {
          const irow = utable.insertRow(-1);
          let cs = irow.insertCell(-1);
          cs.innerHTML = `<input type="radio" id="${phsclass}%${unames[ui]}" name="${phsclass}"> <label for="${phsclass}%${unames[ui]}">${unames[ui]}</label>`;
        }
      }
      document.getElementById("showPHSList").style.display = 'none';
  };

  document
    .getElementById("selectlistofnetworks")
    .addEventListener("click", function (event) {
      const networkselection = document.getElementById("networkselection").value.trim();
      document.getElementById("networkphsclassselection").innerText = 'Select';
      document.getElementById("networkphsclassinputunames").innerHTML = '';
      if (networkselection.length > 0) {
        const nids = networkselection.split(",");
        if (nids.length > 1) {
          document.getElementById("networkid").innerHTML = "Multiple";
          document.getElementById("networkid").dataset.init = networkselection;
          document.getElementById("networkphsclassinputunames").innerHTML = "";
        } else {
          if(nids[0].length==0)
            return;
          document.getElementById("networkid").innerHTML = activeNetworks[nids[0]].name; //"network" + nids[0];
          document.getElementById("networkid").dataset.init = networkselection;
          //Set PHS information
          const id = parseInt(nids[0],10);
          if(id in networkData){
            if('input' in networkData[id]){
              const phsclass = networkData[id]['input']['phsclass'];
              const definedcomponents = networkData[id]['input']['components'];
              document.getElementById("networkphsclassselection").innerText = phsclass;
              if (phsclass in activephsclasses) {
                const utable = document.getElementById("networkphsclassinputunames");
                const unames =
                  activephsclasses[phsclass]["phs"]["portHamiltonianMatrices"]["u"][
                    "elements"
                  ];
                utable.innerHTML = "";
                let uc = 0;
                for (const ui in unames) {
                  const irow = utable.insertRow(-1);
                  let cs = irow.insertCell(-1);
                  let ck = definedcomponents[uc]?"checked":"";
                  cs.innerHTML = `<input type="radio" id="${phsclass}%${unames[ui]}" name="${phsclass}" ${ck}> <label for="${phsclass}%${unames[ui]}">${unames[ui]}</label>`;
                  uc +=1;
                }
              }
            }
          }
        }
        document.getElementById("networkTxt").style.display = "block";
        document.getElementById("internalnetworkdef").style.display = "none";
        document.getElementById("boundarynetworkdef").style.display = "none";
        //Uncheck unselected ones
        let ctable = document.getElementById("configureActiveNetworks");
        for (let i = 1, row; row = ctable.rows[i]; i++) {
          if(nids.includes(row.children[2].textContent)){
            row.children[3].childNodes[0].checked = true;
          }else{
            row.children[3].childNodes[0].checked = false;
          }
        }        

        //Check if all nids are boundary, if so show mapping
        let bdry = true;
        for (const n in nids) {
          if (nids[n][0] != "-") {
            bdry = false;
            break;
          }
        }
        if (bdry) {
          document.getElementById("boundarynetworkdef").style.display = "block";
        }else{
          document.getElementById("internalnetworkdef").style.display = "block";
        }
      }
    });

  document
    .getElementById("generateGraphUsingAPI")
    .addEventListener("click", function (event) {
      document.getElementById("loadAPIModel").style.display = "none";
      evaluatePython();
    });

  document
    .getElementById("loadAPIModel")
    .addEventListener("click", function (event) {
      let dt = document.getElementById("loadAPIModel").dataset.init;
      if (dt.length > 0) {
        try {
          let cselect = graph.getSelectionCell();
          graph.selectAll();
          let cells = graph.getSelectionCells();
          if (cells.length > 0 && documentChanged) {
            //Check for save as well
            if (
              confirm("Graph has not been saved! Do you wish to continue?") ==
              false
            ) {
              graph.setSelectionCell(cselect);
              return;
            }
          }
          const dcells = graph.removeCells();
          for (let cell of dcells) {
            graph.view.clear(cell, true, false);
          }
        } catch (e) {}
        currentNodeOffset = 0;
        edgeCounter = 1;
        boundaryNetworkID = -1;
        usedOffsets = [0.0, 0.0];
        activephsclasses = Object();
        phsClassColor = Object();
        activeNetworks = Object();
        networkData = Object();
        compositionErrors = Object();
        activePHSwindowUpdated = false;
        activePHSwindow = null;

        //Clear inputs
        showStatusMessage("");
        document.getElementById("selectednodes").value = "";
        document.getElementById("selectededges").value = "";
        document.getElementById("connectnodeid").value = "";
        document.getElementById("networkselection").value = "";
        document.getElementById("phslist").innerHTML = "";
        if ("projectname" in provenance) {
          let dtp = JSON.parse(dt);
          dtp["Provenance"] = provenance;
          dt = JSON.stringify(dtp);
          document.getElementById("loadAPIModel").dataset.init = dt;
        }
        var textArea = document.getElementById("jsonTxt");
        textArea.value = dt;
        const jsonObj = JSON.parse(dt);
        var jsonViewer = new JSONViewer();
        document.getElementById("jview").textContent = "";
        document
          .getElementById("jview")
          .appendChild(jsonViewer.getContainer());
        jsonViewer.showJSON(jsonObj);

        loadModel(dt);
        openTab("GraphicalEditor");
        //Change button colour to show it has been selected
        document.getElementById("ftuEditor").style.backgroundColor = "gray";

        document.getElementById("loadFTUJson").style.display = "none";
        document.getElementById("loadFTUImage").style.display = "none";
        document.getElementById("createFTUJson").style.display = "none";
        document.getElementById("loadAPIModel").style.display = "none";
      }
    });

  // When the user clicks anywhere outside of the modal, close it
  window.addEventListener("click", function (event) {
    if (
      event.target == document.getElementById("loadFTUJson") ||
      event.target == document.getElementById("loadFTUImage") ||
      event.target == document.getElementById("createFTUJson") ||
      event.target == document.getElementById("loadPHSDialog") ||
      event.target == document.getElementById("showPHSList") ||
      event.target == document.getElementById("HelpInformation") ||
      event.target == document.getElementById("ProjectProperties")
    ) {
      document.getElementById("loadFTUJson").style.display = "none";
      document.getElementById("loadFTUImage").style.display = "none";
      document.getElementById("createFTUJson").style.display = "none";
      document.getElementById("loadPHSDialog").style.display = "none";
      document.getElementById("showPHSList").style.display = "none";
      document.getElementById("HelpInformation").style.display = "none";
      document.getElementById("ProjectProperties").style.display = "none";
    } else if (event.target.classList.contains("phsuserdata")) {
      activePHSwindowUpdated = false;
    }
  });

  //Tab handling
  var x = document.getElementsByClassName("w3-button");
  const parent = this;
  for (let i = 0; i < x.length; i++) {
    x[i].addEventListener("click", function (evt: Event) {
      let tabName = evt.currentTarget.innerHTML; //this is the button
      const res = openTab(tabName);
      if(res)
        evt.currentTarget.style.backgroundColor = "gray";
    });
  }

  document.getElementById("deletenodes").addEventListener("click", function () {
    let cid = document.getElementById("selectednodes").value.trim().split(",");
    let cells = [];
    for (let i = 0; i < cid.length; i++) {
      cells.push(graphNodes[cid[i]]);
    }
    graph.setSelectionCells(cells);
    const dcells = graph.removeCells();
    for (let cell of dcells) {
      graph.view.clear(cell, true, false);
    }
    for (let i = 0; i < cid.length; i++) {
      delete graphNodes[cid[i]];
    }
    document.getElementById("selectednodes").value = "";
  });

  document.getElementById("deleteedges").addEventListener("click", function () {
    let cid = document.getElementById("selectededges").value.trim().split(",");
    let cells = [];
    for (let i = 0; i < cid.length; i++) {
      cells.push(graphEdges[cid[i]]);
    }
    graph.setSelectionCells(cells);
    const dcells = graph.removeCells();
    for (let cell of dcells) {
      graph.view.clear(cell, true, false);
    }
    for (let i = 0; i < cid.length; i++) {
      delete graphEdges[cid[i]];
    }
    document.getElementById("selectededges").value = "";
  });

  document.getElementById("loadPHSBtn").addEventListener("click", function () {
    document.getElementById("loadPHSDialog").style.display = "block";
  });

  //Add listener to find changes
  const defaultChangeListener = graph.graphModelChangeListener;

  graph
    .getDataModel()
    .addListener(
      InternalEvent.CHANGE,
      function (sender: any, evt: EventObject) {
        documentChanged = true;
        if (defaultChangeListener != null) {
          defaultChangeListener(sender, evt);
        }
      }
    );

  graph.getLabel = function (cell) {
    if (cell.isEdge()) {
      if (showEdgeLabels && cell.value != null) return "" + cell.value["label"];
      else return "";
    }
    if (cell.value) {
      return "" + cell.value["label"];
    }
  };

  const rbh = new RubberBandHandler(graph);

  let rubberbandMouseUp = rbh.mouseUp;
  rbh.mouseUp = function (sender, me) {
    rubberbandMouseUp.apply(this, arguments);
    //Do later as cells will be selected
    let cells = graph.getSelectionCells();
    let cid = [];
    let eid = [];
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].isVertex()) {
        try {
          cid.push(cells[i].value["label"]);
        } catch (err) {
          //Ignore background image
        }
      } else if (cells[i].isEdge()) {
        if (cells[i].value == null) {
          cells[i].value = { label: edgeCounter };
          //Check if it is connected to boundary
          if (
            cells[i].source.value["type"] == "out" ||
            cells[i].target.value["type"] == "out"
          ) {
            const bid = "" + -boundaryNetworkID;
            let blabel = "Bdry Net " + -boundaryNetworkID;
            cells[i].value["weight"] = { bid: -boundaryNetworkID };
            activeNetworks[-boundaryNetworkID] = {
              type: "boundary",
              edges: [edgeCounter],
              name: blabel,
              id: -boundaryNetworkID,
              dissipative: false
            };
            boundaryNetworkID -= 1;

            //Update display datatable
            let newData = {
              headings : ["Type","Edges","Name","ID","Dissipative?","Select"],
              data : [[activeNetworks[-boundaryNetworkID].type,activeNetworks[-boundaryNetworkID].edges,activeNetworks[-boundaryNetworkID].name,activeNetworks[-boundaryNetworkID].id,activeNetworks[-boundaryNetworkID].dissipative,false]]
            }
            displayActiveNetworkDataTable.insert(newData);  
            configureActiveNetworksDataTable.insert(newData); 

          }
          edgeCounter += 1;
        }
        eid.push(cells[i].value["label"]);
      }
    }
    cid.sort();
    eid.sort();
    document.getElementById("selectednodes").value = cid.join(",");
    document.getElementById("selectededges").value = eid.join(",");
  };

  //Move the tooltip to the status bar
  const tooltips = document.getElementsByClassName("mxTooltip");
  const statusbar = document.getElementById("statusbar");
  for (var tt = 0; tt < tooltips.length; tt++) {
    statusbar.appendChild(tooltips[tt]);
  }

  //Handle image drops
  function handleDrop(graph, file, x, y) {
    // Handles each file as a separate insert for simplicity.
    // Use barrier to handle multiple files as a single insert.

    if (file.type.substring(0, 5) === "image") {
      const reader = new FileReader();

      reader.onload = function (e) {
        // Gets size of image for vertex
        let data = e.target.result;

        // SVG needs special handling to add viewbox if missing and
        // find initial size from SVG attributes (only for IE11)
        if (file.type.substring(0, 9) === "image/svg") {
          const comma = data.indexOf(",");
          const svgText = atob(data.substring(comma + 1));
          const root = xmlUtils.parseXml(svgText);

          // Parses SVG to find width and height
          if (root != null) {
            const svgs = root.getElementsByTagName("svg");

            if (svgs.length > 0) {
              const svgRoot = svgs[0];
              let w = parseFloat(svgRoot.getAttribute("width"));
              let h = parseFloat(svgRoot.getAttribute("height"));

              // Check if viewBox attribute already exists
              const vb = svgRoot.getAttribute("viewBox");

              if (vb == null || vb.length === 0) {
                svgRoot.setAttribute("viewBox", `0 0 ${w} ${h}`);
              }
              // Uses width and height from viewbox for
              // missing width and height attributes
              else if (Number.isNaN(w) || Number.isNaN(h)) {
                const tokens = vb.split(" ");

                if (tokens.length > 3) {
                  w = parseFloat(tokens[2]);
                  h = parseFloat(tokens[3]);
                }
              }

              w = Math.max(1, Math.round(w));
              h = Math.max(1, Math.round(h));

              data = `data:image/svg+xml,${btoa(
                xmlUtils.getXml(svgs[0], "\n")
              )}`;
              graph.insertVertex({
                position: [x, y],
                size: [w, h],
                style: {
                  shape: "image",
                  image: data,
                  zorder: -20,
                },
              });
            }
          }
        } else {
          const img = new Image();

          img.onload = () => {
            const w = Math.max(1, img.width);
            const h = Math.max(1, img.height);

            // Converts format of data url to cell style value for use in vertex
            const semi = data.indexOf(";");

            if (semi > 0) {
              data =
                data.substring(0, semi) +
                data.substring(data.indexOf(",", semi + 1));
            }

            graph.insertVertex({
              position: [x, y],
              size: [w, h],
              style: { shape: "image", image: data, zorder: -20 },
            });
          };

          img.src = data;
        }
      };

      reader.readAsDataURL(file);
    }
  }

  /*End Graph setup */

  //Logic for handling HTML javascript
}

//Tried methods based on addEventListener, didnt work as input field
//change/input events cannot be triggered by programatic change of values
//Using the pooling method instead
//Ensure that BondgraphModule is loaded
var intervalId = setInterval(function () {
  if (BondGraphModule != null) {
    setupFTUGraphEditor();
    document.pyodideMplTarget = document.getElementById('compositemodelphsimages')
    clearInterval(intervalId);
    let wfdrequest = new XMLHttpRequest();
    wfdrequest.open("GET", "src/workflowdescription.md", true);
    wfdrequest.send(null);
    wfdrequest.onreadystatechange = function () {
      if (wfdrequest.readyState === 4 && wfdrequest.status === 200) {
        let type = wfdrequest.getResponseHeader("Content-Type");
        if (type.indexOf("text") !== 1) {
          document.getElementById("helpinfocontent").innerHTML = Marked.parse(
            wfdrequest.responseText
          );
        }
      }
    };
  }
}, 500);