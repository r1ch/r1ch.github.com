// Minimal Simplex Noise implementation
class SimplexNoise {
    constructor(random) {
        if (!random) random = Math.random;
        this.p = new Uint8Array(256);
        this.perm = new Uint8Array(512);
        this.permMod12 = new Uint8Array(512);
        for (let i = 0; i < 256; i++) {
            this.p[i] = Math.floor(random() * 256);
        }
        for (let i = 0; i < 512; i++) {
            this.perm[i] = this.p[i & 255];
            this.permMod12[i] = this.perm[i] % 12;
        }
        this.grad3 = [
            [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
            [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
            [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
        ];
    }
    noise2D(xin, yin) {
        const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
        const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
        let n0, n1, n2;
        let s = (xin + yin) * F2;
        let i = Math.floor(xin + s);
        let j = Math.floor(yin + s);
        let t = (i + j) * G2;
        let X0 = i - t;
        let Y0 = j - t;
        let x0 = xin - X0;
        let y0 = yin - Y0;
        let i1, j1;
        if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
        let x1 = x0 - i1 + G2;
        let y1 = y0 - j1 + G2;
        let x2 = x0 - 1.0 + 2.0 * G2;
        let y2 = y0 - 1.0 + 2.0 * G2;
        let ii = i & 255;
        let jj = j & 255;
        let gi0 = this.permMod12[ii + this.perm[jj]];
        let gi1 = this.permMod12[ii + i1 + this.perm[jj + j1]];
        let gi2 = this.permMod12[ii + 1 + this.perm[jj + 1]];
        let t0 = 0.5 - x0 * x0 - y0 * y0;
        if (t0 < 0) n0 = 0.0;
        else { t0 *= t0; n0 = t0 * t0 * (this.grad3[gi0][0] * x0 + this.grad3[gi0][1] * y0); }
        let t1 = 0.5 - x1 * x1 - y1 * y1;
        if (t1 < 0) n1 = 0.0;
        else { t1 *= t1; n1 = t1 * t1 * (this.grad3[gi1][0] * x1 + this.grad3[gi1][1] * y1); }
        let t2 = 0.5 - x2 * x2 - y2 * y2;
        if (t2 < 0) n2 = 0.0;
        else { t2 *= t2; n2 = t2 * t2 * (this.grad3[gi2][0] * x2 + this.grad3[gi2][1] * y2); }
        return 70.0 * (n0 + n1 + n2);
    }
}

const app = Vue.createApp({});

app.component('graph-background', {
    props: ['currentPath', 'choices'],
    template: '<div id="background-graph"></div>',
    mounted() {
        this.initGraph();
        window.addEventListener('resize', this.handleResize);
    },
    beforeUnmount() {
        window.removeEventListener('resize', this.handleResize);
    },
    methods: {
        buildTreeData(nodeId, visited = new Set()) {
            if (!questions[nodeId]) return null;
            if (visited.has(nodeId)) return null; // Avoid infinite cycles

            const newVisited = new Set(visited);
            newVisited.add(nodeId);

            let node = { 
                name: nodeId, 
                ...questions[nodeId],
                children: [] 
            };

            if (questions[nodeId].answers) {
                node.children = questions[nodeId].answers.map(answer => {
                    const child = this.buildTreeData(answer.next, newVisited);
                    if (child) {
                        child.edgeLabel = answer.text;
                    }
                    return child;
                }).filter(n => n !== null);
            }

            return node;
        },
        drawLandscape(svg, width, height, links, root) {
            const g = svg.append("g").attr("class", "landscape");
            const noise = new SimplexNoise();
            
            // Configuration for the terrain
            const renderSize = Math.max(width, height) * 4; // Significantly larger to handle panning
            // Centered coordinates require offsetting by renderSize/2
            const resolution = 300; // Grid resolution for heightmap (higher = smoother but slower)
            const cellSize = renderSize / resolution;

            // --- Collision Mask Setup (moved up for use in terrain generation) ---
            // Setup collision mask for links to determine snow vs rock areas
            const collisionCanvas = document.createElement('canvas');
            // Use same coordinate system as map: renderSize
            // We'll use a slightly higher resolution for collision to be accurate
            const colRes = resolution * 2; 
            const colScale = colRes / renderSize;
            
            collisionCanvas.width = colRes;
            collisionCanvas.height = colRes;
            const colCtx = collisionCanvas.getContext('2d', { willReadFrequently: true });
            
            // Transform context: Center (0,0) is at (colRes/2, colRes/2)
            colCtx.translate(colRes/2, colRes/2);
            // Scale so that 1 unit in SVG world = colScale units in canvas
            colCtx.scale(colScale, colScale);
            
            // Draw links
            colCtx.lineCap = 'round';
            colCtx.lineJoin = 'round';
            colCtx.strokeStyle = '#000'; 
            
            if (links) {
                const linkGen = d3.linkRadial()
                    .angle(d => d.x)
                    .radius(d => d.y)
                    .context(colCtx);
                links.forEach(d => {
                    // Set width based on type
                    if (d.styleType === 'run') {
                         colCtx.lineWidth = 120;
                    } else {
                         colCtx.lineWidth = 50; // Narrower "ski area" for lifts
                    }
                    colCtx.beginPath();
                    linkGen(d);
                    colCtx.stroke();
                });
            }
            
            // Get data for pixel checking
            // We need to transform back to pixel coordinates
            const colData = colCtx.getImageData(0, 0, colRes, colRes).data;
            
            const checkLinkCollision = (x, y) => {
                 // Convert world (x,y) to canvas pixel coordinates
                 // Center is at (0,0) world -> (colRes/2, colRes/2) canvas
                 const cx = Math.floor(x * colScale + colRes/2);
                 const cy = Math.floor(y * colScale + colRes/2);
                 
                 if (cx < 0 || cx >= colRes || cy < 0 || cy >= colRes) return false;
                 
                 const idx = (cy * colRes + cx) * 4 + 3;
                 return colData[idx] > 10; // Alpha check
            };
            
            // Get all nodes for IDW (Inverse Distance Weighting)
            const nodes = root.descendants().map(d => {
                // Convert radial (angle, radius) to cartesian (x, y)
                // Note: d.x is angle in radians, d.y is radius
                // SVG coordinates are centered at (0,0) due to viewBox
                // But for IDW we need consistent coordinates
                const angle = d.x - Math.PI / 2;
                return {
                    x: d.y * Math.cos(angle),
                    y: d.y * Math.sin(angle),
                    z: d.elevation || 0
                };
            });

            // Calculate min/max elevation for normalization
            let minZ = Infinity, maxZ = -Infinity;
            nodes.forEach(n => {
                if (n.z < minZ) minZ = n.z;
                if (n.z > maxZ) maxZ = n.z;
            });
            // Expand range slightly to avoid edge cases
            const zRange = Math.max(0.1, maxZ - minZ);
            
            // Function to calculate height at (x, y)
            const calculateHeight = (x, y) => {
                let numerator = 0;
                let denominator = 0;
                const p = 2; // Power parameter for IDW
                
                // Optimization: Only consider closest N nodes? 
                // For small tree size (<50 nodes), all nodes is fine.
                
                let minDist = Infinity;
                
                for (let i = 0; i < nodes.length; i++) {
                    const node = nodes[i];
                    const distSq = (x - node.x) ** 2 + (y - node.y) ** 2;
                    const dist = Math.sqrt(distSq);
                    
                    if (dist < 0.1) return node.z; // Exact match
                    
                    if (dist < minDist) minDist = dist;

                    const weight = 1 / (distSq + 1000); // Add constant to avoid singularity and smooth
                    numerator += weight * node.z;
                    denominator += weight;
                }
                
                let h = numerator / denominator;
                
                // Add procedural noise for terrain roughness
                // Scale coordinate to noise space
                const nx = x * 0.005;
                const ny = y * 0.005;
                const n = noise.noise2D(nx, ny);
                
                return h + n * 0.5; // Blend noise
            };

            // Use D3 Contours if available, otherwise just use color bands
            // Since we can't guarantee d3-contour is loaded, we'll try to detect it
            // or implement a simple quantized rendering via canvas.
            
            const values = new Float32Array(resolution * resolution);
            
            // Generate Heightmap Data First
            for (let j = 0; j < resolution; j++) {
                for (let i = 0; i < resolution; i++) {
                     const wx = (i - resolution/2) * cellSize;
                     const wy = (j - resolution/2) * cellSize;
                     values[j * resolution + i] = calculateHeight(wx, wy);
                }
            }

            // Prepare rendering layers
            // Layer 1: Rocks (Background, will be blurred)
            const rockCanvas = document.createElement('canvas');
            rockCanvas.width = resolution;
            rockCanvas.height = resolution;
            const rockCtx = rockCanvas.getContext('2d');
            const rockData = rockCtx.createImageData(resolution, resolution);

            // Layer 2: Snow (Foreground, will be sharp)
            const snowCanvas = document.createElement('canvas');
            snowCanvas.width = resolution;
            snowCanvas.height = resolution;
            const snowCtx = snowCanvas.getContext('2d');
            const snowData = snowCtx.createImageData(resolution, resolution);
            
            // Light direction (Sun from top-left)
            const lx = -1, ly = -1, lz = 1.5;
            const lLen = Math.sqrt(lx*lx + ly*ly + lz*lz);
            const nlx = lx/lLen, nly = ly/lLen, nlz = lz/lLen;

            // Z-scale for shading exaggeration
            const zScale = 4.0;

            for (let j = 0; j < resolution; j++) {
                for (let i = 0; i < resolution; i++) {
                    const wx = (i - resolution/2) * cellSize;
                    const wy = (j - resolution/2) * cellSize;
                    const idx = (j * resolution + i) * 4;
                    const h = values[j * resolution + i];

                    // Determine Terrain Type
                    const isSkiArea = checkLinkCollision(wx, wy);
                    
                    // Calculate Normal for shading
                    const i0 = Math.max(0, i-1), i1 = Math.min(resolution-1, i+1);
                    const j0 = Math.max(0, j-1), j1 = Math.min(resolution-1, j+1);
                    
                    const dzdx = (values[j*resolution + i1] - values[j*resolution + i0]) / ((i1-i0) * cellSize);
                    const dzdy = (values[j1*resolution + i] - values[j0*resolution + i]) / ((j1-j0) * cellSize);
                    
                    // Normal vector (-dzdx, -dzdy, 1)
                    const nx = -dzdx * zScale;
                    const ny = -dzdy * zScale;
                    const nz = 1;
                    const nLen = Math.sqrt(nx*nx + ny*ny + nz*nz);
                    
                    // Dot product for diffuse lighting
                    const diffuse = (nx*nlx + ny*nly + nz*nlz) / nLen;
                    const intensity = Math.max(0, Math.min(1, diffuse));

                    // Normalize h for coloring
                    let normH = (h - minZ) / zRange;
                    normH = Math.max(0, Math.min(1, normH));
                    
                    // Quantize for contour effect
                    const levels = 12;
                    const quantized = Math.floor(normH * levels) / levels;

                    if (isSkiArea) {
                        // SNOW: Use shading
                        // Create gradient from Shadow -> Highlight
                        // Shadow (Intensity 0.2): Icy Blue
                        // Light (Intensity 1.0): White
                        
                        const light = Math.pow(intensity, 0.7); // Adjust curve
                        
                        let r = 200 + light * 55;
                        let g = 230 + light * 25;
                        let b = 255;
                        
                        // Add subtle banding overlay for "contour" effect
                        const band = quantized * 10;
                        r += band; g += band; b += band;

                        // Clamp
                        r = Math.min(255, r); g = Math.min(255, g); b = Math.min(255, b);
                        
                        snowData.data[idx] = r;
                        snowData.data[idx+1] = g;
                        snowData.data[idx+2] = b;
                        snowData.data[idx+3] = 255;
                        
                        // Transparent on rock canvas
                        rockData.data[idx+3] = 0;
                    } else {
                        // ROCK
                        // High frequency noise for texture
                        let base = 240;
                        const textureScale = 0.5;
                        const textureVal = noise.noise2D(wx * textureScale, wy * textureScale);
                        
                        base = base - (1-quantized) * 40;
                        
                        let r, g, b;

                        if (textureVal > 0.4) {
                            r = 80; g = 70; b = 60;
                        } else if (textureVal < -0.4) {
                             r = 255; g = 255; b = 255;
                        } else {
                            r = base; g = base * 0.98; b = base * 0.95;
                        }
                        
                        rockData.data[idx] = r;
                        rockData.data[idx+1] = g;
                        rockData.data[idx+2] = b;
                        rockData.data[idx+3] = 255;
                        
                        // Transparent on snow canvas
                        snowData.data[idx+3] = 0;
                    }
                }
            }
            
            rockCtx.putImageData(rockData, 0, 0);
            snowCtx.putImageData(snowData, 0, 0);
            
            // Draw into SVG as images
            const imageSize = resolution * cellSize;
            
            // 1. Rock Layer (Blurred)
            g.append("image")
                .attr("href", rockCanvas.toDataURL())
                .attr("x", -imageSize/2)
                .attr("y", -imageSize/2)
                .attr("width", imageSize)
                .attr("height", imageSize)
                .attr("opacity", 0.9)
                .style("filter", "blur(3px)");
                
            // 2. Snow Layer (Sharp, to preserve shading detail)
            g.append("image")
                .attr("href", snowCanvas.toDataURL())
                .attr("x", -imageSize/2)
                .attr("y", -imageSize/2)
                .attr("width", imageSize)
                .attr("height", imageSize)
                .attr("opacity", 1.0);
                
            // Use d3.contours if available for nicer lines
            if (d3.contours) {
                const contours = d3.contours()
                    .size([resolution, resolution])
                    .thresholds(12) // 12 contour lines
                    (values);
                
                // Project contours back to SVG coordinates
                // d3.geoPath works with GeoJSON. We need a projection that scales 
                // grid coordinates (0..resolution) to world coordinates.
                const projection = d3.geoIdentity()
                    .scale(cellSize)
                    .translate([-imageSize/2, -imageSize/2]);
                
                const path = d3.geoPath(projection);
                
                g.append("g")
                    .attr("class", "contours")
                    .selectAll("path")
                    .data(contours)
                    .enter().append("path")
                        .attr("d", path)
                        .attr("fill", "none")
                        .attr("stroke", "#62e0fa") // Darker stroke for contrast on snow
                        .attr("stroke-width", 5)
                        .attr("stroke-opacity", 1)
                        .attr("filter","blur(8px)");
            }

            // --- Vegetation (Trees) ---
            const treeGroup = svg.append("g").attr("class", "trees");
            
            const samples = 8000;
            const maxR = Math.min(width, height); // Area to scatter trees
            
            for(let k=0; k<samples; k++) {
                const r = Math.sqrt(Math.random()) * maxR * 1.5;
                const theta = Math.random() * 2 * Math.PI;
                const x = r * Math.cos(theta);
                const y = r * Math.sin(theta);
                
                // Get elevation
                const h = calculateHeight(x, y);
                // Check if suitable for trees (low to mid elevation)
                // Normalize h
                const normH = (h - minZ) / zRange;
                
                // Trees grow below 0.6 elevation
                if (normH < 0.8) {
                    if (checkLinkCollision(x, y)) continue;
                    
                    // Add some noise to tree placement density
                    const n = noise.noise2D(x*0.01, y*0.01);
                    if (n > 0) {
                        const scale = 0.8 + Math.random() * 0.5;
                         treeGroup.append("path")
                            .attr("d", `M0,0 l-5,15 l10,0 z`) 
                            .attr("transform", `translate(${x},${y}) scale(${scale})`)
                            .attr("fill", "#19692c") // Darker green
                            .attr("opacity", 1.0);
                    }
                }
            }
        },
        initGraph() {
            const width = window.innerWidth;
            const height = window.innerHeight;

            // For meandering paths
            const pathNoise = new SimplexNoise();
            const tempPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            const radialGenerator = d3.linkRadial()
                .angle(d => d.x)
                .radius(d => d.y);

            const generateMeanderingPath = (d) => {
                // Generate the base radial path to get the correct curve shape
                const pathString = radialGenerator(d);
                tempPath.setAttribute("d", pathString);
                
                const totalLen = tempPath.getTotalLength();
                if (totalLen === 0) return pathString;

                const points = [];
                const segments = Math.max(10, Math.floor(totalLen / 10)); // Sample every 10px approx

                for (let i = 0; i <= segments; i++) {
                    const t = i / segments;
                    const pt = tempPath.getPointAtLength(t * totalLen);
                    
                    // Add noise to intermediate points
                    let dx = 0, dy = 0;
                    if (i > 0 && i < segments) {
                        // Use link ID hash for stability
                        // We need a numeric seed. link-123 -> 123
                        // If ID is string based, hash it.
                        let seed = 0;
                        if (d.id) {
                            for(let c=0; c<d.id.length; c++) seed = ((seed << 5) - seed) + d.id.charCodeAt(c);
                        }
                        seed = Math.abs(seed);
                        
                        // Noise based on position along path (t) and link seed
                        // Scale t for frequency
                        const noiseX = pathNoise.noise2D(t * 5, seed * 0.1);
                        const noiseY = pathNoise.noise2D(t * 5 + 100, seed * 0.1);
                        
                        const amplitude = 3; // 3px wobble
                        dx = noiseX * amplitude;
                        dy = noiseY * amplitude;
                    }
                    
                    points.push([pt.x + dx, pt.y + dy]);
                }
                
                return d3.line().curve(d3.curveBasis)(points);
            };

            const treeData = this.buildTreeData('start');
            const root = d3.hierarchy(treeData);

            // Radial layout
            const treeLayout = d3.tree()
                .size([2 * Math.PI, Math.min(width, height) * 2])
                .separation((a, b) => {
                    if (a.data.name === 'james' || b.data.name === 'james') {
                        return 3.5;
                    }
                    return (a.parent == b.parent ? 1 : 2) / a.depth;
                });

            treeLayout(root);

            // Rotate tree so 'james' is vertical
            const jamesNode = root.descendants().find(d => d.data.name === 'james');
            if (jamesNode) {
                const currentAngle = jamesNode.x;
                const offset = 0 - currentAngle;
                root.descendants().forEach(d => {
                    d.x += offset;
                });
            }

            // Capture links once so we can modify them and reuse the same objects
            const links = root.links();
            
            // Assign types to links for styling and IDs for referencing
            links.forEach((d, i) => {
                d.id = `link-${i}`; // Stable ID based on traversal order
                const target = d.target.data;
                // Simple hash for consistent random assignment
                const hash = (str) => {
                    let h = 0;
                    for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
                    return h;
                };
                const pseudoRandom = Math.abs(hash(d.source.data.name + d.target.data.name)) % 100;

                if (target.type) {
                    // It's a result node -> RUN
                    d.styleType = 'run';
                    // Randomly assign run color based on pseudoRandom
                    if (pseudoRandom > 66) d.runColor = 'run-black';
                    else if (pseudoRandom > 33) d.runColor = 'run-red';
                    else d.runColor = 'run-blue';
                } else {
                    // It's a question node -> LIFT
                    if (pseudoRandom > 66) d.styleType = 'lift-chair';
                    else if (pseudoRandom > 33) d.styleType = 'lift-gondola';
                    else d.styleType = 'lift-drag';
                }
            });

            // Calculate Elevation for procedural map
            // Assign elevation to each node based on traversal
            // Start node = 0
            // Lift = Uphill (+1)
            // Run = Downhill (-1)
            // But since D3 hierarchy expands all paths, we can just walk down from root
            root.each(d => {
                if (!d.parent) {
                    d.elevation = 0;
                } else {
                    // Find the link connecting parent to this node
                    const link = links.find(l => l.source === d.parent && l.target === d);
                    if (link) {
                        if (link.styleType === 'run') {
                            d.elevation = d.parent.elevation - 1.5; // Runs go down faster
                        } else {
                            d.elevation = d.parent.elevation + 0.8; // Lifts go up
                        }
                    } else {
                         d.elevation = d.parent.elevation; // Fallback
                    }
                }
            });

            const svg = d3.select("#background-graph")
                .html("")
                .append("svg")
                .attr("width", width)
                .attr("height", height)
                .attr("viewBox", [-width/2, -height/2, width, height])
                .style("max-width", "100%")
                .style("height", "auto");
            
            const g = svg.append("g");
            this.g = g;

            // Draw Landscape Background
            this.drawLandscape(g, width, height, links, root);

            const linkGroup = g.append("g").attr("class", "links");

            // 1. RUNS (Curved, Colored)
            const runs = linkGroup.selectAll(".run")
                .data(links.filter(d => d.styleType === 'run'))
                .join("path")
                .attr("class", d => `link run ${d.runColor}`)
                .attr("id", d => d.id)
                .attr("fill", "none")
                .attr("d", d => generateMeanderingPath(d));

            // 2. DRAG LIFTS (Straight lines)
            const drags = linkGroup.selectAll(".lift-drag")
                .data(links.filter(d => d.styleType === 'lift-drag'))
                .join("path")
                .attr("class", "link lift-drag")
                .attr("id", d => d.id)
                .attr("fill", "none")
                .attr("d", d => {
                     // Straight line projection
                     const sa = d.source.x - Math.PI / 2;
                     const sr = d.source.y;
                     const ta = d.target.x - Math.PI / 2;
                     const tr = d.target.y;
                     return `M${sr * Math.cos(sa)},${sr * Math.sin(sa)}L${tr * Math.cos(ta)},${tr * Math.sin(ta)}`;
                });

            // 3. CHAIR LIFTS (Dashed + Chairs)
            const chairGroup = linkGroup.selectAll(".lift-chair-group")
                .data(links.filter(d => d.styleType === 'lift-chair'))
                .join("g")
                .attr("class", "lift-chair-group");
            
            // The path itself
            chairGroup.append("path")
                .attr("class", "link lift-chair")
                .attr("id", d => d.id) // ID used for labels later
                .attr("fill", "none")
                .attr("d", d => generateMeanderingPath(d));
            
            // The chairs
            chairGroup.each(function(d) {
                 const pathElement = d3.select(this).select("path").node();
                 // We need to wait for the path to be in DOM or compute manually?
                 // D3 appends synchronously. However, getPointAtLength usually works.
                 // If radius is large, length is large.
                 try {
                     const len = pathElement.getTotalLength();
                     const spacing = 40;
                     const numChairs = Math.floor(len / spacing);
                     
                     for(let i=1; i<=numChairs; i++) {
                         const pt = pathElement.getPointAtLength(i * spacing);
                         d3.select(this).append("rect")
                            .attr("x", pt.x - 3)
                            .attr("y", pt.y - 3)
                            .attr("width", 6)
                            .attr("height", 6)
                            .attr("class", "chair-marker");
                     }
                 } catch(e) {
                     console.warn("Could not draw chairs", e);
                 }
            });

            // 4. GONDOLA LIFTS (Dashed + Emoji)
            const gondolaGroup = linkGroup.selectAll(".lift-gondola-group")
                .data(links.filter(d => d.styleType === 'lift-gondola'))
                .join("g")
                .attr("class", "lift-gondola-group");
            
            // The path itself
            gondolaGroup.append("path")
                .attr("class", "link lift-gondola")
                .attr("id", d => d.id)
                .attr("fill", "none")
                .attr("d", d => generateMeanderingPath(d));
            
            // The gondolas
            gondolaGroup.each(function(d) {
                 const pathElement = d3.select(this).select("path").node();
                 try {
                     const len = pathElement.getTotalLength();
                     const spacing = 60;
                     const numGondolas = Math.floor(len / spacing);
                     
                     for(let i=1; i<=numGondolas; i++) {
                         const pt = pathElement.getPointAtLength(i * spacing);
                         d3.select(this).append("text")
                            .attr("x", pt.x)
                            .attr("y", pt.y)
                            .attr("class", "gondola-marker")
                            .attr("text-anchor", "middle")
                            .attr("dominant-baseline", "central")
                            .attr("font-size", "14px")
                            .html("&#x1F6A1");
                     }
                 } catch(e) {
                     console.warn("Could not draw gondolas", e);
                 }
            });

            // Combine all links for the 'this.link' selection used in highlighting
            // We need a selection that covers all link paths.
            // Since we have different structures (path vs g > path), it's tricky.
            // Let's select all elements with class 'link' inside the linkGroup.
            const allLinks = linkGroup.selectAll(".link");

            const node = g.append("g")
                .attr("class", "nodes")
                .selectAll("g")
                .data(root.descendants())
                .join("g")
                .attr("class", "node")
                .attr("transform", d => `
                    rotate(${d.x * 180 / Math.PI - 90})
                    translate(${d.y},0)
                `);

            node.append("circle")
                .attr("r", 5)
                .attr("class", d => d.data.type ? d.data.type : "");

            // Bring trees to the foreground
            g.select(".trees").raise();

            this.addDebugLabels(g, links, node);

            this.svg = svg;
            this.root = root;
            this.link = allLinks; // Update reference for highlighting
            this.node = node.select("circle");
            
            this.updateHighlight();
        },
        addDebugLabels(g, links, node) {
            const linkLabels = g.append("g")
                .attr("class", "link-labels")
                .selectAll("text")
                .data(links)
                .join("text")
                .attr("dy", -3);

            linkLabels.append("textPath")
                .attr("href", d => `#${d.id}`)
                .attr("startOffset", "50%")
                .style("text-anchor", "middle")
                .text(d => d.target.data.edgeLabel || "")
                .style("font-size", "10px")
                .style("pointer-events", "none");

            node.append("title")
                .text(d => d.data.text);

            node.append("text")
                .attr("dy", "15") // Position below the node
                .attr("x", 0)
                .attr("text-anchor", "middle")
                // Counter-rotate the text so it's always horizontal
                .attr("transform", d => `rotate(${- (d.x * 180 / Math.PI - 90)})`)
                .text(d => d.data.name)
                .style("font-size", "10px")
                .style("fill", "#666") // Match edge style
                .style("pointer-events", "none");
        },
        updateHighlight() {
            if (!this.root || !this.link || !this.node) return;
            
            const questionToKey = new Map();
            Object.entries(questions).forEach(([key, value]) => {
                questionToKey.set(value, key);
            });

            const pathIds = this.currentPath.map(q => questionToKey.get(Vue.toRaw(q)));
            const activeNodeNames = new Set(pathIds);
            
            // Find the current active node (last in the path)
            const currentId = pathIds[pathIds.length - 1];
            let activeNode = null;
            
            // Traverse the tree to find the specific node instance for the current path
            // Since we aren't coalescing, we need to follow the path from root
            // But wait, D3 hierarchy structure mimics the buildTreeData structure.
            // Let's find the node that matches the current path sequence.
            
            // Actually, simpler approach:
            // Since buildTreeData recursively builds it, the structure matches the path.
            // But wait, duplicate nodes exist in different branches. 
            // We need to find the node that corresponds to the END of the current path.
            
            // Let's walk down from root using pathIds
            let currentNode = this.root;
            if (currentNode && currentNode.data.name === pathIds[0]) {
                for (let i = 1; i < pathIds.length; i++) {
                    if (!currentNode.children) break;
                    
                    const targetName = pathIds[i];
                    // choices[i-1] corresponds to the transition from node (i-1) to node i
                    const edgeLabel = this.choices && this.choices[i-1];

                    const nextNode = currentNode.children.find(child => {
                        if (child.data.name !== targetName) return false;
                        if (edgeLabel && child.data.edgeLabel && child.data.edgeLabel !== edgeLabel) return false;
                        return true;
                    });

                    if (nextNode) {
                        currentNode = nextNode;
                    } else {
                        break;
                    }
                }
                activeNode = currentNode;
            }

            // Highlight nodes and links
            // We need to highlight the path to this specific activeNode
            // Ancestors of activeNode are the path
            const pathNodes = activeNode ? activeNode.ancestors() : [];
            const pathNodeIds = new Set(pathNodes.map(d => d));
            
            this.node.classed("active", d => pathNodeIds.has(d));
            this.link.classed("active", d => pathNodeIds.has(d.target)); // Highlight link to the target
            
            // Center the view on the active node
            if (activeNode && this.g) {
                const r = activeNode.y;
                const a = activeNode.x - Math.PI / 2; // Subtract 90 degrees to align with 0 at top
                
                // Convert to Cartesian
                const x = r * Math.cos(a);
                const y = r * Math.sin(a);
                
                // Transition to center this point
                // We want (x,y) to be at (0,0) in the view (since viewBox is centered at 0,0)
                // So we translate by (-x, -y)
                
                this.g.transition()
                    .duration(750)
                    .attr("transform", `translate(${-x},${-y})`);
            }
        },
        handleResize() {
            const width = window.innerWidth;
            const height = window.innerHeight;
            if (this.svg) {
                // For tree layout, simple resize isn't enough, we might need to re-layout.
                // But for now, let's just update viewBox and width/height
                this.svg
                    .attr("width", width)
                    .attr("height", height);
                
                // Re-running initGraph to re-calculate tree positions based on new size
                this.initGraph();
            }
        }
    },
    watch: {
        currentPath: {
            handler() {
                this.updateHighlight();
            },
            deep: true
        },
        choices: {
            handler() {
                this.updateHighlight();
            },
            deep: true
        }
    }
});

app.component('faff-interview', {
    data() {
        return {
            interview: [questions.start],
            choices: [],
        };
    },
    methods: {
        choose(index, answer) {
            this.interview.splice(index + 1);
            this.choices.splice(index);
            this.choices.push(answer.text);
            this.interview.push(questions[answer.next]);
        },
        chooseSelect(index, event) {
            const selectedIndex = event.target.selectedIndex;
            // The first option is disabled "Select an option"
            // So answers index is selectedIndex - 1
            const answerIndex = selectedIndex - 1;
            if (answerIndex >= 0) {
                const question = this.interview[index];
                const answer = question.answers[answerIndex];
                this.choose(index, answer);
            }
        }
    },
    template: `
        <graph-background :current-path="interview" :choices="choices"></graph-background>
        <div class="container question-container">
            <form>
                <div class="mb-3" v-for="(question, qIndex) in interview">
                    <div class="alert" :class="'alert-'+question.type" v-if="!question.answers">
                        <h5>{{question.answer}}</h5>
                        {{question.text}}
                    </div>
                    <label :for="'label_'+qIndex" class="form-label" v-if="question.answers">{{question.text}}</label>
                    <div v-if="question.answers && question.answers.length <= 2">
                        <div class="form-check" v-for="(answer, aIndex) in question.answers">
                            <input @change="choose(qIndex, answer)" :name="'radio_'+qIndex" :id="'radio_'+qIndex+'_'+aIndex" type="radio" class="form-check-input" :value="answer.next">
                            <label :for="'radio_'+qIndex+'_'+aIndex" class="form-check-label">{{answer.text}}</label>
                        </div>
                    </div>
                    <div v-if="question.answers && question.answers.length > 2">
                        <select class="form-select" @change="chooseSelect(qIndex, $event)">
                            <option selected disabled>Select an option</option>
                            <option v-for="answer in question.answers" :value="answer.next">{{answer.text}}</option>
                        </select>
                    </div>
                </div>
            </form>
        </div>
    `,
});

app.mount('#app');
