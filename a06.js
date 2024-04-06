/*
 This file is a template for a05 CS433/533
 
 Author: Amir Mohammad Esmaieeli Sikaroudi
 Email: amesmaieeli@email.arizona.edu
 Date: April, 2022
 
 Sources uses for this template:
 First Obj parser:
 https://webglfundamentals.org/
 The library for decoding PNG files is from:
 https://github.com/arian/pngjs
*/

var input = document.getElementById("load_scene");
input.addEventListener("change", readScene);
var dummy_canvas = document.getElementById('dummy_canvas');
var ctx = dummy_canvas.getContext('2d');

var renderingCanvas = document.querySelector("#canvas");
var gl = renderingCanvas.getContext("webgl",{preserveDrawingBuffer: true});

var modelMatrix;

var currentScene;//Current rendering scene

var doneLoading=false;//Checks if the scene is done loading to prevent renderer draw premuturly.
var doneProgramming=false;
var filesToRead=[];//List of files to be read
var imageData;//The image contents are stored separately here
var scene;//The code can save multiple scenes but no HTML element is made to give user option of switching scenes without selecting file agail. By default the firt scene is shown and the other selected scenes are just stored.
var objParsed;

// Mirror camera position
var cameraPositionPrime;

var scriptLoadTime = Date.now();
var animationSpeed = -0.1;

var billboardProgram;
var waterHeight=0.2;
var rfRatio = 0.7;

var wh = document.getElementById('whID');//Slider for water height

wh.addEventListener("input", function(evt) {
	if(doneLoading==true){
		waterHeight=Number(wh.value);
		var wZLabel = document.getElementById("whLabelID");
		wZLabel.innerHTML = wh.value;
		wh.label = "Water height: "+wh.value;//refresh wh text
	}
},false);

var rf = document.getElementById("rfID");//Slider for reflection/refraction ratio

rf.addEventListener("input", (e) => {
	if (doneLoading==true) {
		rfRatio = Number(rf.value);
		document.getElementById("rfLabelID").innerHTML = rf.value;
		rf.label = "Reflection/Refraction ratio: "+rf.value;//refresh rf text
	}
}, false);

function readScene()//This is the function that is called after user selects multiple files of images and scenes
{
	if (input.files.length > 0) {
		if(doneLoading==true)//This condition checks if this is the first time user has selected a scene or not. If doneLoading==true, then the user has selected a new scene while rendering
		{
			newSceneRequested=true;
			filesToRead=[];//List of files to be read
			imageData=[];//The image contents are stored separately here
			objsData=[];
			scenes=[];//List of scenes
		}
		doneLoading=false;
		for(var i=0;i<input.files.length;i++)
		{
			var file = input.files[i];
			var reader = new FileReader();
			filesToRead[i]=true;
			reader.onload = (function(f,index) {
				return function(e) {
					//Get the file name
					let fileName = f.name;
					//Get the file Extension 
					let fileExtension = fileName.split('.').pop();
					if(fileExtension=='ppm')
					{
						var file_data = this.result;
						let img=parsePPM(file_data,fileName);//Parse image
						imageData.push(img);
						filesToRead[index]=false;
					}else if(fileExtension=='js')
					{
						var file_data = this.result;
						scene=parseScene(file_data);//Parse scene
						filesToRead[index]=false;
					}else if(fileExtension=='json')
					{
						var file_data = this.result;
						scene=parseScene(file_data);//Parse scene
						filesToRead[index]=false;
					}else if(fileExtension=='obj')
					{
						var file_data = this.result;
						objParsed=parseOBJ(file_data);//Parse obj to almost buffer-ready Float32Array arrays.
						
						filesToRead[index]=false;
					}else if(fileExtension=='png')
					{
						var file_data = this.result;
						
						var pngImage = new PNGReader(file_data);
						
						pngImage.parse(function(err, png){
							if (err) throw err;
							
							let img = parsePNG(png,fileName);
							
							let width=img.width;
							let height=img.height;
							document.getElementById("dummy_canvas").setAttribute("width", img.width);
							document.getElementById("dummy_canvas").setAttribute("height", img.height);
							let showCaseData = ctx.createImageData(width, height);
							for(var i = 0; i < img.data.length; i+=1){
								showCaseData.data[i*4]=img.data[i].r;
								showCaseData.data[i*4+1]=img.data[i].g;
								showCaseData.data[i*4+2]=img.data[i].b;
								showCaseData.data[i*4+3]=img.data[i].a;
							}
							ctx.putImageData(showCaseData, dummy_canvas.width/2 - width/2, dummy_canvas.height/2 - height/2);
							
							let imageRead=ctx.getImageData(0, 0, dummy_canvas.width, dummy_canvas.height);
							imageData=imageRead;
							filesToRead[index]=false;
						});
					}
				};
			})(file,i);
			let fileName = file.name;
			let fileExtension = fileName.split('.').pop();
			if(fileExtension=='ppm' || fileExtension=='js' || fileExtension=='json' || fileExtension=='obj')
			{
				reader.readAsBinaryString(file);
			}else if(fileExtension=='png'){
				reader.readAsArrayBuffer(file);
			}
			
		}
		drawScene();//Enter the drawing loop();
	}
}

// Draw the scene.
function drawScene(now) {
	if(doneLoading==false)
	{
		var isReaminingRead=false;
		for(let j=0;j<filesToRead.length;j++)
		{
			if(filesToRead[j]==true)//Check if each file is read
			{
				isReaminingRead=true;//If one is not read, then make sure drawing scene will wait for files to be read
			}
		}
		if(isReaminingRead==false)//If all files are read
		{
			currentScene=scene;
			currentScene.billboard.img=imageData;
			
			doneLoading=true;
		}
	}else if(doneLoading==true)//If scene is completely read
	{
		if(doneProgramming==false){
			programAll();
			preprocessBuffers();
			doneProgramming=true;
			
			// Support for Alpha
			gl.enable(gl.BLEND)
			gl.colorMask(true, true, true, true);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		}else{
			renderingFcn(now);
		}
	}
	
	// Call drawScene again next frame with delay to give user chance of interacting GUI
	requestAnimationFrame(drawScene);
}

function renderingFcn(now){
	gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
	webglUtils.resizeCanvasToDisplaySize(gl.canvas);
	
	gl.clearColor(currentScene.camera.DefaulColor[0], currentScene.camera.DefaulColor[1], currentScene.camera.DefaulColor[2], 1.0);
	
	// Clear the canvas AND the depth buffer.
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	
	renderBillboard(now);
}

function renderBillboard(now){
	gl.disable(gl.CULL_FACE);
	
	// Tell it to use our program (pair of shaders)
    gl.useProgram(billboardProgram.program);
	
    // Turn on the position attribute
    gl.enableVertexAttribArray(billboardProgram.positionLocationAttrib);

    // Bind the position buffer.
    gl.bindBuffer(gl.ARRAY_BUFFER, currentScene.billboard.positionBuffer);
	
	// Tell the position attribute how to get data out of positionBuffer (ARRAY_BUFFER)
    var size = 3;          // 3 components per iteration
    var type = gl.FLOAT;   // the data is 32bit floats
    var normalize = false; // don't normalize the data
    var stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next position
    var offset = 0;        // start at the beginning of the buffer
    gl.vertexAttribPointer(
        billboardProgram.positionLocationAttrib, size, type, normalize, stride, offset);
	
	// Turn on the normal attribute
    gl.enableVertexAttribArray(billboardProgram.normalLocationAttrib);

    // Bind the normal buffer.
    gl.bindBuffer(gl.ARRAY_BUFFER, currentScene.billboard.normalBuffer);
	
	// Tell the normal attribute how to get data out of normalBuffer (ARRAY_BUFFER)
    var size = 3;          // 3 components per iteration
    var type = gl.FLOAT;   // the data is 32bit floats
    var normalize = false; // don't normalize the data
    var stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next normal
    var offset = 0;        // start at the beginning of the buffer
    gl.vertexAttribPointer(
        billboardProgram.normalLocationAttrib, size, type, normalize, stride, offset);
		
	
	// Turn on the normal attribute
    gl.enableVertexAttribArray(billboardProgram.textureLocationAttrib);

    // Bind the normal buffer.
    gl.bindBuffer(gl.ARRAY_BUFFER, currentScene.billboard.textureBuffer);
	
	// Tell the normal attribute how to get data out of normalBuffer (ARRAY_BUFFER)
    var size = 2;          // 3 components per iteration
    var type = gl.FLOAT;   // the data is 32bit floats
    var normalize = false; // don't normalize the data
    var stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next normal
    var offset = 0;        // start at the beginning of the buffer
    gl.vertexAttribPointer(
        billboardProgram.textureLocationAttrib, size, type, normalize, stride, offset);
	
    // Compute the projection matrix
    var aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    var projectionMatrix =
        m4.perspective(degToRad(currentScene.camera.fov), aspect, currentScene.camera.near, currentScene.camera.far);

	var cameraMatrix;
	// Compute the camera's matrix using look at.
	cameraMatrix = m4.lookAt([currentScene.camera.position.x,currentScene.camera.position.y,currentScene.camera.position.z], [currentScene.camera.target.x,currentScene.camera.target.y,currentScene.camera.target.z], [currentScene.camera.up.x,currentScene.camera.up.y,currentScene.camera.up.z]);

    // Make a view matrix from the camera matrix.
    var viewMatrix = m4.inverse(cameraMatrix);

    var viewProjectionMatrix = m4.multiply(projectionMatrix, viewMatrix);
	
    // Set the viewProjectionMatrix.
	gl.uniformMatrix4fv(billboardProgram.worldViewProjectionUniformLocation, false, viewProjectionMatrix);
	
	// Tell the shader to use texture unit 0 for u_texture
    gl.uniform1i(billboardProgram.textureUniformLocation, 0);
	
	// Send the light direction to the uniform.
	gl.uniform3fv(billboardProgram.lightDirectionUniformLocation, new Float32Array([currentScene.light.locationPoint.x,currentScene.light.locationPoint.y,currentScene.light.locationPoint.z]));

	// Send time (in seconds) to uniform
	gl.uniform1f(billboardProgram.timeLocation, animationSpeed * (Date.now() - scriptLoadTime) / 1000);

	// Send water height to uniform
	gl.uniform1f(billboardProgram.waterHeightLocation, waterHeight);

	// Send reflection/refraction ratio to uniform
	gl.uniform1f(billboardProgram.rfLocation, rfRatio);
	
	gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function programAll(){
	programBillboard();
}

function preprocessBuffers(){
	makeBillboardBuffers();
}

function makeBillboardBuffers(){
	let sceneBillboard=currentScene.billboard;
	
	// Create a buffer for positions
    let billboardPositionBuffer = gl.createBuffer();
    // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = positionBuffer)
    gl.bindBuffer(gl.ARRAY_BUFFER, billboardPositionBuffer);
    // Put the positions in the buffer
    setBillboardGeometry(gl,sceneBillboard);
	
    // provide texture coordinates for the rectangle.
    let billboardTextcoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, billboardTextcoordBuffer);
    // Set Texcoords.
    setBillboardTexcoords(gl,sceneBillboard);
  
    // Create a buffer to put normals in
    let billboardNormalBuffer = gl.createBuffer();
    // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = normalBuffer)
    gl.bindBuffer(gl.ARRAY_BUFFER, billboardNormalBuffer);
    // Put normals data into buffer
    setBillboardNormals(gl,sceneBillboard);
	
	// Create a texture.
	var billboardTextureBuffer = gl.createTexture();
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, billboardTextureBuffer);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,gl.UNSIGNED_BYTE, imageData);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.generateMipmap(gl.TEXTURE_2D);
  
    sceneBillboard.setBuffers(billboardPositionBuffer,billboardTextcoordBuffer,billboardNormalBuffer,billboardTextureBuffer);
}

class BillboardProgram{
	constructor(program,positionLocationAttrib,normalLocationAttrib,textureLocationAttrib,textureUniformLocation,worldViewProjectionUniformLocation,lightDirectionUniformLocation,timeLocation,waterHeightLocation,rfLocation){
		this.program=program;
		this.positionLocationAttrib=positionLocationAttrib;
		this.normalLocationAttrib=normalLocationAttrib;
		this.textureLocationAttrib=textureLocationAttrib;
		this.textureUniformLocation=textureUniformLocation;
		this.worldViewProjectionUniformLocation=worldViewProjectionUniformLocation;
		this.lightDirectionUniformLocation=lightDirectionUniformLocation;
		this.timeLocation=timeLocation;
		this.waterHeightLocation=waterHeightLocation;
		this.rfLocation=rfLocation;
	}
}

function programBillboard(){
	//TODO: Change the shader program to calculate Snell's law. This is the major part of this homework.
	// You need to implement circle logic, calculate the angles, calculate displacement and change the texture coordinate accordingly.
	// Additionally you need to implement light intensity logic which follows the Snell's law.
	// You can check if the displaced texture coordinate is outside [0,1] and make the fragments invisible (shows background)
	// The waves should follow sin and cosin functions in x and z directions. The frequency depends on the time scale passes to the shader program.
	var vShaderObj = "attribute vec4 a_position;\n"+
				"attribute vec3 a_normal;\n"+
				"attribute vec2 a_texcoord;\n"+
				"varying vec2 v_texcoord;\n"+
				"varying vec3 v_normal;\n"+
				"uniform mat4 u_worldViewProjection;\n"+
				"void main() {\n"+
					"// Sending the interpolated normal to the fragment shader.\n"+
					"v_normal = a_normal;\n"+
					"// Pass the texcoord to the fragment shader.\n"+
					"v_texcoord = a_texcoord;\n"+
					"// Multiply the position by the matrix.\n"+
					"gl_Position = u_worldViewProjection * a_position;\n"+
				"}";
	var fShaderObj = 	"precision highp float;\n"+
					"varying vec3 v_normal;\n"+
					"varying vec2 v_texcoord;\n"+
					"uniform vec3 u_lightDirection;\n"+
					"uniform sampler2D u_texture;\n"+
					"uniform float u_time;\n"+
					"uniform float u_waterHeight;\n"+
					"uniform float u_rfRatio;\n"+
					"vec3 linInterp(vec3 a, vec3 b, float t);\n"+
					"void main() {\n"+
						"float A = 0.01;\n"+
						"float lambda = 0.02;\n"+
						// 1. calculate normal based on water ripple
						//   calculate dx and dy
						"float x = v_texcoord.x - 0.5;\n"+
						"float y = v_texcoord.y - 0.5;\n"+
						"float r = sqrt(x*x + y*y);\n"+
						//   make amplitude decrease inverse distance away from center (not distance squared because doesn't really work)
						"A = A / r;\n"+
						"float dx = (A * x) / (lambda * r) * cos((u_time + r) / lambda);\n"+
						"float dy = (A * y) / (lambda * r) * cos((u_time + r) / lambda);\n"+
						//   do cross product to get normal
						"vec3 dxVec = vec3(1.0, 0.0, dx);\n"+
						"vec3 dyVec = vec3(0.0, 1.0, dy);\n"+
						"vec3 normal = normalize(cross(dxVec, dyVec));\n"+
						// 2. calculate incident angle
						"vec3 camDir = vec3(0.0, 0.0, 1.0);\n"+
						"float incidentAngle = acos(dot(normal, camDir));\n"+
						// 3. calculate refracted angle (assuming water refracted index is 2)
						"float refractedAngle = asin(sin(incidentAngle) / 2.0);\n"+
						// 4. calculate refracted ray direction
						"vec3 refractedDir = normalize(linInterp(-normal, -camDir, refractedAngle / incidentAngle));\n"+
						// 5. extrapolate refractedDir vector to bottom of pool floor based on waterHeight
						//   calculate extra water height due to water wave (removed)
						//"float hOfXY = A * sin((u_time + r) / lambda);\n"+
						"float refScalar = abs((u_waterHeight) / refractedDir.z);\n"+
						"vec3 rayToFloor = refractedDir * refScalar;\n"+
						// 6. fix texcoord based on displacement of rayToFloor
						"vec2 newTexCoord = vec2(v_texcoord.x + rayToFloor.x, v_texcoord.y + rayToFloor.y);\n"+

						"gl_FragColor = texture2D(u_texture, newTexCoord);\n"+
						"gl_FragColor.rgb *= u_rfRatio;\n"+
						// 7. do reflection lighting
						//   find reflected direction (https://www.geogebra.org/classic/dhuxtmcx)
						//   reflected direction = normal + (normal - camDir)
						"vec3 reflectedDir = normalize(normal + (normal - camDir));\n"+
						//   calculate dot product between reflected direction and sun direction
						"float refVal = abs(dot(reflectedDir, normalize(u_lightDirection)));\n"+
						//   apply lighting
						"gl_FragColor.rgb += (1.0 - u_rfRatio) * refVal * vec3(1.0, 1.0, 1.0);\n"+

						//"gl_FragColor = vec4(dx, 0.0, 0.0, 1.0);\n"+ // FOR DEBUGGING
					"}\n"+
					"\n"+
					"vec3 linInterp(vec3 a, vec3 b, float t) {\n"+ // helper function to linearly interpolate between two vecs
					"	return a * (1.0 - t) + b * t;\n"+
					"}\n";
	programBill = webglUtils.createProgramFromSources(gl, [vShaderObj,fShaderObj])
	
	// look up where the vertex data needs to go.
    positionLocationAttrib = gl.getAttribLocation(programBill, "a_position");
	normalLocationAttrib = gl.getAttribLocation(programBill, "a_normal");
	textureLocationAttrib = gl.getAttribLocation(programBill, "a_texcoord");
	
	// lookup uniforms
    textureUniformLocation = gl.getUniformLocation(programBill, "u_texture");
	worldViewProjectionUniformLocation = gl.getUniformLocation(programBill, "u_worldViewProjection");
	lightDirectionUniformLocation = gl.getUniformLocation(programBill, "u_lightDirection");
	timeLocation = gl.getUniformLocation(programBill, "u_time");
	waterHeightLocation = gl.getUniformLocation(programBill, "u_waterHeight");
	rfLocation = gl.getUniformLocation(programBill, "u_rfRatio");
	
	billboardProgram=new BillboardProgram(programBill,positionLocationAttrib,normalLocationAttrib,textureLocationAttrib,textureUniformLocation,worldViewProjectionUniformLocation,lightDirectionUniformLocation,timeLocation,waterHeightLocation,rfLocation);
}

//The function for parsing PNG is done for you. The output is a an array of RGBA instances.
function parsePNG(png,fileName){
	let rawValues = png.getRGBA8Array();
	let width = png.getWidth();
	let height = png.getHeight();
	var readImageValues=[];//Array of RGBA instances
	var counterMain=0;//It is used for array of RGBAValue instances.
	for(var i = 0; i < rawValues.length; i++){
		let r=rawValues[i*4];
		let g=rawValues[i*4+1];
		let b=rawValues[i*4+2];
		let a=rawValues[i*4+3];
		readImageValues[counterMain]=new RGBAValue(r,g,b,a);
		counterMain=counterMain+1;
	}
	return new PNGImage(readImageValues,width,height,fileName);
}

class PNGImage{
	constructor(data,width,height,fileName){
		this.data=data;// The 1D array of RGBA pixel instances
		this.fileName=fileName;// Filename is useful to connect this image to appropriate Billboard after all materials are read.
		this.width=width;// Width of image
		this.height=height;// Height of image
	}
}

class RGBAValue{
	constructor(r,g,b,a)
	{
		this.r=r;
		this.g=g;
		this.b=b;
		this.a=a;
	}
}

function radToDeg(r) {
	return r * 180 / Math.PI;
}

function degToRad(d) {
	return d * Math.PI / 180;
}

// A utility function to convert a javascript Floar32Array to a buffer. This function must be called after the buffer is bound.
function setGeometryPositionBuffer(gl,obj) {
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(obj.geometries[0].data.position), gl.STATIC_DRAW);
}

// A utility function to convert a javascript Floar32Array to a buffer. This function must be called after the buffer is bound.
function setTextureCoordBuffer(gl,obj) {
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(obj.geometries[0].data.texcoord), gl.STATIC_DRAW);
}

// A utility function to convert a javascript Floar32Array to a buffer. This function must be called after the buffer is bound.
function setNormalBuffer(gl,obj) {
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(obj.geometries[0].data.normal), gl.STATIC_DRAW);
}

//This is a utility function to set vertex colors by random numbers
function setColorBuffer(gl,obj) {
	var numVertices=obj.geometries[0].data.position.length;
	var colors = new Float32Array(numVertices*3);
	var myrng = new Math.seedrandom('123');
	for(let i=0;i<numVertices*3;i++){
		colors[i]=0.4+myrng()/2;
	}
	gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
}

// Complete this function with counter clock-wise vertices of the billboard. The billboard should be made of two triangles.
function setBillboardGeometry(gl,billboard) {
	var positions = new Float32Array([
	billboard.UpperLeft.x, billboard.UpperLeft.y, billboard.UpperLeft.z,  // first triangle
    billboard.LowerLeft.x, billboard.LowerLeft.y, billboard.UpperRight.z,
    billboard.UpperRight.x, billboard.UpperRight.y, billboard.LowerLeft.z,
    billboard.UpperRight.x,  billboard.UpperRight.y, billboard.LowerLeft.z,  // second triangle
    billboard.LowerLeft.x,  billboard.LowerLeft.y, billboard.LowerRight.z,
    billboard.LowerRight.x,  billboard.LowerRight.y, billboard.LowerRight.z
	]);
	gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
}

function setBillboardTexcoords(gl,billboard) {
  gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([	  
	  0,0,
	  0,1,
	  1,0,
	  1,0,
	  0,1,
	  1,1
	  ]),
      gl.STATIC_DRAW);
}

function setBillboardNormals(gl,billboard) {
  let vec1=Vector3.minusTwoVectors(billboard.UpperLeft,billboard.LowerLeft);
  let vec2=Vector3.minusTwoVectors(billboard.LowerRight,billboard.LowerLeft);
  var normalVector=Vector3.crossProduct(vec2,vec1);//billboard normal vector
  gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([	  
	  normalVector.x,normalVector.y,normalVector.z,
	  normalVector.x,normalVector.y,normalVector.z,
	  normalVector.x,normalVector.y,normalVector.z,
	  normalVector.x,normalVector.y,normalVector.z,
	  normalVector.x,normalVector.y,normalVector.z,
	  normalVector.x,normalVector.y,normalVector.z
	  ]),
      gl.STATIC_DRAW);
}

//This function is given to you for parsing the OBJ file.
function parseOBJ(text) {
  // because indices are base 1 let's just fill in the 0th data
  const objPositions = [[0, 0, 0]];
  const objTexcoords = [[0, 0]];
  const objNormals = [[0, 0, 0]];

  // same order as `f` indices
  const objVertexData = [
    objPositions,
    objTexcoords,
    objNormals,
  ];

  // same order as `f` indices
  let webglVertexData = [
    [],   // positions
    [],   // texcoords
    [],   // normals
  ];

  const materialLibs = [];
  const geometries = [];
  let geometry;
  let groups = ['default'];
  let material = 'default';
  let object = 'default';

  const noop = () => {};

  function newGeometry() {
    if (geometry && geometry.data.position.length) {
      geometry = undefined;
    }
  }

  function setGeometry() {
    if (!geometry) {
      const position = [];
      const texcoord = [];
      const normal = [];
      webglVertexData = [
        position,
        texcoord,
        normal,
      ];
      geometry = {
        object,
        groups,
        material,
        data: {
          position,
          texcoord,
          normal,
        },
      };
      geometries.push(geometry);
    }
  }

  function addVertex(vert) {
    const ptn = vert.split('/');
    ptn.forEach((objIndexStr, i) => {
      if (!objIndexStr) {
        return;
      }
      const objIndex = parseInt(objIndexStr);
      const index = objIndex + (objIndex >= 0 ? 0 : objVertexData[i].length);
      webglVertexData[i].push(...objVertexData[i][index]);
    });
  }

  const keywords = {
    v(parts) {
      objPositions.push(parts.map(parseFloat));
    },
    vn(parts) {
      objNormals.push(parts.map(parseFloat));
    },
    vt(parts) {
      objTexcoords.push(parts.map(parseFloat));
    },
    f(parts) {
      setGeometry();
      const numTriangles = parts.length - 2;
      for (let tri = 0; tri < numTriangles; ++tri) {
        addVertex(parts[0]);
        addVertex(parts[tri + 1]);
        addVertex(parts[tri + 2]);
      }
    },
    s: noop,    // smoothing group
    mtllib(parts, unparsedArgs) {
      materialLibs.push(unparsedArgs);
    },
    usemtl(parts, unparsedArgs) {
      material = unparsedArgs;
      newGeometry();
    },
    g(parts) {
      groups = parts;
      newGeometry();
    },
    o(parts, unparsedArgs) {
      object = unparsedArgs;
      newGeometry();
    },
  };

  const keywordRE = /(\w*)(?: )*(.*)/;
  const lines = text.split('\n');
  for (let lineNo = 0; lineNo < lines.length; ++lineNo) {
    const line = lines[lineNo].trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const m = keywordRE.exec(line);
    if (!m) {
      continue;
    }
    const [, keyword, unparsedArgs] = m;
    const parts = line.split(/\s+/).slice(1);
    const handler = keywords[keyword];
    if (!handler) {
      console.warn('unhandled keyword:', keyword);  // eslint-disable-line no-console
      continue;
    }
    handler(parts, unparsedArgs);
  }

  for (const geometry of geometries) {
    geometry.data = Object.fromEntries(
        Object.entries(geometry.data).filter(([, array]) => array.length > 0));
  }

  return {
    geometries,
    materialLibs,
  };
}

//Extra math functions. This can not be used in shader program. GLSL has its own math functions.
class Vector3{
	constructor(x,y,z){
		this.x=x;
		this.y=y;
		this.z=z;
	}
	static multiplyVectorScalar(vec,scalar){
		return new Vector3(vec.x*scalar,vec.y*scalar,vec.z*scalar);
	}
	static sumTwoVectors(vec1,vec2){
		return new Vector3(vec1.x+vec2.x,vec1.y+vec2.y,vec1.z+vec2.z);
	}
	static minusTwoVectors(vec1,vec2){
		return new Vector3(vec1.x-vec2.x,vec1.y-vec2.y,vec1.z-vec2.z);
	}
	static normalizeVector(vec){
		let sizeVec=Math.sqrt(Math.pow(vec.x,2)+Math.pow(vec.y,2)+Math.pow(vec.z,2));
		return new Vector3(vec.x/sizeVec,vec.y/sizeVec,vec.z/sizeVec);
	}
	static crossProduct(vec1,vec2){
		return new Vector3(vec1.y * vec2.z - vec1.z * vec2.y,vec1.z * vec2.x - vec1.x * vec2.z,vec1.x * vec2.y - vec1.y * vec2.x);
	}
	static negate(vec){
		return new Vector3(-vec.x,-vec.y,-vec.z);
	}
	static dotProduct(vec1,vec2){
		var result = 0;
		result += vec1.x * vec2.x;
		result += vec1.y * vec2.y;
		result += vec1.z * vec2.z;
		return result;
	}
	static distance(p1,p2){
		return Math.sqrt(Math.pow(p1.x-p2.x,2)+Math.pow(p1.y-p2.y,2)+Math.pow(p1.z-p2.z,2));
	}
	static getMagnitude(vec){
		return Math.sqrt(Math.pow(vec.x,2)+Math.pow(vec.y,2)+Math.pow(vec.z,2));
	}
}


class Billboard{
	constructor(UpperLeft,LowerLeft,UpperRight,LowerRight,imgFile,img,ambient){
		this.UpperLeft=UpperLeft;
		this.LowerLeft=LowerLeft;
		this.UpperRight=UpperRight;
		this.LowerRight=LowerRight;
		this.imgFile=imgFile;
		this.img=img;
		this.ambient=ambient;
	}
	
	setBuffers(positionBuffer,textureBuffer,normalBuffer,billboardTextureBuffer){
		this.positionBuffer=positionBuffer;
		this.textureBuffer=textureBuffer;
		this.normalBuffer=normalBuffer;
		this.billboardTextureBuffer=billboardTextureBuffer;
	}
}

class SunLight{//Light source
	constructor(locationPoint){
		this.locationPoint=locationPoint;
	}
}

class Camera{
	constructor(position,target,up,fov,far,near,DefaulColor){
		this.position=position;
		this.target=target;
		this.up=up;
		this.fov=fov;//IMPORTANT: It is assumed that FOV is the angle between the center vector and edge of the frustum (half pyramid) but not the entire frustum (full pyramid).
		this.far=far;
		this.near=near;
		this.DefaulColor=DefaulColor;
	}
	setVectors(w,nw,u,v){
		this.w=w;
		this.nw=nw;
		this.u=u;
		this.v=v;
	}
}

class Scene{//This object technically stores everything required for a scene
	constructor(light,billboard,obj,mirror,camera){
		this.light=light;
		this.billboard=billboard;
		this.camera=camera;
		this.obj=obj;
		this.mirror=mirror;
	}
}

class Ray{
	constructor(origin,direction){
		this.origin=origin;
		this.direction=direction;
	}
}

function parseScene(file_data)//A simple function to read JSON and put the data inside a scene class and return the read scene
{
	var sceneFile = JSON.parse(file_data);
	let pos=new Vector3(sceneFile.eye[0],sceneFile.eye[1],sceneFile.eye[2]);
	let lookat=new Vector3(sceneFile.lookat[0],sceneFile.lookat[1],sceneFile.lookat[2]);
	let up=new Vector3(sceneFile.up[0],sceneFile.up[1],sceneFile.up[2]);
	let fov=sceneFile.fov_angle;
	let near=sceneFile.near;
	let far=sceneFile.far;
	let DefaulColor=sceneFile.DefaulColor;
	var camera=new Camera(pos,lookat,up,fov,far,near,DefaulColor);
	let light=new SunLight(new Vector3(sceneFile.SunLocation[0],sceneFile.SunLocation[1],sceneFile.SunLocation[2]));
	var billboard;
	if ('billboard' in sceneFile) {//If billboard exists in scene
		let upperLeft=new Vector3(sceneFile.billboard.UpperLeft[0],sceneFile.billboard.UpperLeft[1],sceneFile.billboard.UpperLeft[2]);
		let lowerLeft=new Vector3(sceneFile.billboard.LowerLeft[0],sceneFile.billboard.LowerLeft[1],sceneFile.billboard.LowerLeft[2]);
		let upperRight=new Vector3(sceneFile.billboard.UpperRight[0],sceneFile.billboard.UpperRight[1],sceneFile.billboard.UpperRight[2]);
		let billboardHeight=upperLeft.y-lowerLeft.y;
		let lowerRight=new Vector3(upperRight.x,upperRight.y-billboardHeight,upperRight.z);
		
		billboard=new Billboard(upperLeft,lowerLeft,upperRight,lowerRight,sceneFile.billboard.filename,null,null);//Image is assigned to billboard later
	}
	var mirror=null;
	var obj=null;
	return new Scene(light,billboard,obj,mirror,camera);
}