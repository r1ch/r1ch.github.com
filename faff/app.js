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
        drawLandscape(svg, width, height, links) {
            const g = svg.append("g").attr("class", "landscape");
            const contourCount = 12; // More contours for better map look
            const colors = ["#f8f9fa", "#e9ecef", "#dee2e6", "#ced4da"]; 

            const maxRadius = Math.max(width, height) * 1.5;
            const noise = new SimplexNoise();
            
            // --- 1. Collision Mask (Avoid drawing on runs) ---
            const canvas = document.createElement('canvas');
            const renderSize = maxRadius * 2;
            canvas.width = renderSize;
            canvas.height = renderSize;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            
            // Setup coordinates to match SVG centered view
            ctx.translate(renderSize/2, renderSize/2);
            ctx.lineWidth = 60; // Wide buffer to keep trees away from runs
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = '#000'; 

            if (links) {
                const linkGen = d3.linkRadial()
                    .angle(d => d.x)
                    .radius(d => d.y)
                    .context(ctx);
                
                links.forEach(d => {
                    ctx.beginPath();
                    linkGen(d);
                    ctx.stroke();
                });
            }
            
            // Extract pixel data for collision check
            const imgData = ctx.getImageData(0, 0, renderSize, renderSize).data;
            const checkCollision = (x, y) => {
                 const cx = Math.floor(x + renderSize/2);
                 const cy = Math.floor(y + renderSize/2);
                 if (cx < 0 || cx >= renderSize || cy < 0 || cy >= renderSize) return true;
                 const idx = (cy * renderSize + cx) * 4 + 3; // Alpha channel
                 return imgData[idx] > 10;
            };

            // --- 2. Coherent Contours ---
            // Draw from largest (outside) to smallest (inside)
            for (let i = contourCount; i >= 0; i--) {
                const rBase = (maxRadius / contourCount) * (i + 1);
                
                const points = [];
                const steps = 200;
                for (let j = 0; j < steps; j++) {
                    const angle = (j / steps) * 2 * Math.PI;
                    // Use noise that is coherent radially (matches angle) and creates ridges
                    // Scaling angle by small amount makes low freq changes
                    const n = noise.noise2D(Math.cos(angle), Math.sin(angle) + i * 0.1);
                    // Add high frequency noise
                    const nHigh = noise.noise2D(Math.cos(angle * 10), Math.sin(angle * 10) + i * 0.1);
                    
                    const r = rBase + (n * 0.8 + nHigh * 0.2) * (maxRadius / contourCount);
                    points.push([Math.cos(angle) * r, Math.sin(angle) * r]);
                }
                
                const lineGenerator = d3.line().curve(d3.curveBasisClosed);
                
                g.append("path")
                    .attr("d", lineGenerator(points))
                    .attr("fill", colors[i % colors.length])
                    .attr("stroke", "#adb5bd")
                    .attr("stroke-width", 0.5)
                    .style("opacity", 0.6);
            }

            // --- 3. Vegetation & Features ---
            const treeGroup = g.append("g").attr("class", "trees");
            const rockGroup = g.append("g").attr("class", "rocks");
            
            // Sample points
            const samples = 6000;
            for(let k=0; k<samples; k++) {
                // Uniform-ish distribution
                const angle = Math.random() * 2 * Math.PI;
                // Bias slightly towards outer ring for density, but keep center populated
                const r = Math.sqrt(Math.random()) * maxRadius; 
                
                const x = Math.cos(angle) * r;
                const y = Math.sin(angle) * r;

                // Check collision with runs
                if (checkCollision(x, y)) continue;

                // Biome Noise
                const nx = x / 400;
                const ny = y / 400;
                const biome = noise.noise2D(nx, ny);
                const detail = noise.noise2D(nx * 4, ny * 4); 

                // Tree Clumps
                if (biome > 0.15 && detail > -0.2) {
                     const scale = 0.5 + Math.random() * 0.8;
                     treeGroup.append("path")
                        .attr("d", `M0,0 l-5,15 l10,0 z`) 
                        .attr("transform", `translate(${x},${y}) scale(${scale})`)
                        .attr("fill", "#198754")
                        .attr("opacity", 0.6);
                } 
                // Rocky Bluffs
                else if (biome < -0.4 && detail < 0) {
                     const scale = 0.8 + Math.random() * 1.2;
                     rockGroup.append("path")
                        .attr("d", `M0,0 l-6,8 l3,4 l6,-2 l4,-6 z`) 
                        .attr("transform", `translate(${x},${y}) scale(${scale}) rotate(${Math.random()*360})`)
                        .attr("fill", "#6c757d")
                        .attr("opacity", 0.7);
                }
            }
        },
        initGraph() {
            const width = window.innerWidth;
            const height = window.innerHeight;
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
            this.drawLandscape(g, width, height, links);

            const linkGroup = g.append("g").attr("class", "links");

            // 1. RUNS (Curved, Colored)
            const runs = linkGroup.selectAll(".run")
                .data(links.filter(d => d.styleType === 'run'))
                .join("path")
                .attr("class", d => `link run ${d.runColor}`)
                .attr("id", d => d.id)
                .attr("fill", "none")
                .attr("d", d3.linkRadial()
                    .angle(d => d.x)
                    .radius(d => d.y));

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
                .attr("d", d3.linkRadial().angle(d => d.x).radius(d => d.y));
            
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
                .attr("d", d3.linkRadial().angle(d => d.x).radius(d => d.y));
            
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
                .attr("startOffset", "25%")
                .style("text-anchor", "middle")
                .text(d => d.target.data.edgeLabel || "")
                //.style("fill", "#666")
                .style("font-size", "10px")
                //.style("text-shadow", "0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff")
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
        <div class="container">
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
