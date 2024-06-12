# FTU Weaver

A web brower (MS Edge and Google Chrome) based FTU composition editor, and input-ouput Port-hamiltonian generator.
See [Technical Report](TechnicalReport.pdf) for details on FTUs, related mathematics and tool documentation.

## Workflow for creating a FTU

1. Create the FTU graph using the GraphicalEditor or ProceduralEditor,
2. Provide provenance information and save the project, project's can be saved at any stage - automatic backup is not provided,
3. Load the PHS logic for various cell types in the FTU using the PHS Editor, if cell types differ in the parameters alone, duplicate the logic and change the parameters for creating the cell type phs zoo,
4. Set the PHS logic for all the internal cells,
5. Set network for edges. When a graph is generated, all internal nodes are connected by an internal network with id `1`. Edges connecting boundary nodes are also associated to networks with network id `-{node}.id`. However, edges that are connected by hand require network ids to be set by hand,
6. For dissipative networks, set the dissipation strength/power loss coefficient for each associated edge,
7. Associate networks to phs logic input/output components. i.e. for each PHS logic loaded in the PHS Editor, set the `Interconnection Network ID` for each component,
8. Set the network type i.e. dissipative or non-dissipative in the Network Editor. Set the Boundary network's component by selecting the PHS logic and the component from that logic.
9. Execute the Compose logic. Result of composition process is presented in the Composition Editor. Successful compositions can be downloaded as JSON.
10. Saved project configuration is available in the JSON Editor. Project's can be saved from this Editor and can be loaded to progress.
11. Symbolic and Pythonic code generated for successful compositions are available in the Composition Window. 

### Project dependencies
1. pyodide
2. FTU Utils library [https://github.com/Jagirhussan/ftuutils]
3. Mathjax through cdn[https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js]
4. Using latex2sympy package for parsing user input expressions

Latex2sympy depends on antlr4_python_runtime, the appropriate distributions are
latex2sympy2 - 1.9.1, antlr4_python3_runtime 4.7.2
latex2sympy2 was downloaded from pypi[https://files.pythonhosted.org/packages/0c/9e/4520682ab29a9219f1845643fdc75f1453bebf4b602c6e4421579de1f05d/latex2sympy2-1.9.1-py3-none-any.whl]
antlr4 was downloaded from https://github.com/alpine-wheels/antlr4-python3-runtime/releases/download/4.7.2/antlr4_python3_runtime-4.7.2-py3-none-any.whl#sha256=c7026e170cc5210ac27f4edf946a6a4e846f5326c9a3c7ce329aefe428438deb

## Setup

From the project root, run `npm install`.

If you want to use the maxGraph development version (built locally), see the README about maxGraph integration.

## Running the project

Run `npm run dev` and go to http://localhost/


*The typescript code is not build ready*
If you want to bundle the application, run `npm run build` and then run `npm run preview` to access to a preview of the bundle application.
