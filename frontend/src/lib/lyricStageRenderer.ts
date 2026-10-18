export type StageLyric = { timeMs: number; text: string }

const vertexSource = `#version 300 es
in vec2 a_position;
uniform vec4 u_rect;
uniform vec2 u_resolution;
uniform vec4 u_pose;
uniform float u_camera;
uniform float u_zoom;
out vec2 v_uv;
void main() {
  vec2 local = (a_position - .5) * u_rect.zw;
  float x = local.x * cos(u_pose.w);
  float z = u_pose.z - local.x * sin(u_pose.w);
  float perspective = 950.0 / (950.0 + max(z, -650.0));
  vec2 p = u_rect.xy + .5 * u_rect.zw + vec2(x, local.y) * perspective + u_pose.xy;
  p.x += u_camera * (1.0 + z / 1500.0);
  p = .5 * u_resolution + (p - .5 * u_resolution) * u_zoom;
  gl_Position = vec4(p.x / u_resolution.x * 2.0 - 1.0, 1.0 - p.y / u_resolution.y * 2.0, 0.0, 1.0);
  v_uv = vec2(a_position.x, 1.0 - a_position.y);
}`

const backgroundSource = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_camera;
uniform float u_zoom;
out vec4 outColor;
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * u_resolution + vec2(u_camera * .8, 0.0)) / min(u_resolution.x, u_resolution.y) / u_zoom;
  float t = u_time * .00013;
  vec3 c = mix(vec3(.016,.032,.051), vec3(.025,.038,.069), v_uv.y);
  float teal = exp(-dot((p - vec2(-.33 + .08*sin(t), .05))*vec2(1.3,1.0), (p - vec2(-.33 + .08*sin(t), .05))*vec2(1.3,1.0)) * 4.0);
  float blue = exp(-dot((p - vec2(.45 + .07*cos(t*.8), -.18))*vec2(1.1,1.4), (p - vec2(.45 + .07*cos(t*.8), -.18))*vec2(1.1,1.4)) * 4.5);
  float halo = exp(-length(p * vec2(1.0,1.35)) * 3.1);
  c += vec3(.012,.13,.15) * teal + vec3(.055,.075,.20) * blue + vec3(.025,.065,.095) * halo;
  float ring = exp(-pow((length(p * vec2(1.0,1.26)) - .43) * 18.0, 2.0)) * .07;
  c += vec3(.22,.75,.84) * ring;
  vec2 dust = p * vec2(18.0, 12.0) + vec2(t * 1.8, t * .7);
  vec2 cell = floor(dust);
  vec2 dotPos = fract(dust) - .5;
  float random = fract(sin(dot(cell, vec2(23.17, 91.73))) * 35273.34);
  float spark = (1.0 - smoothstep(.0, .035, length(dotPos))) * step(.978, random);
  c += vec3(.22,.49,.58) * spark;
  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233))) * 43758.5453) * .012;
  outColor = vec4(c + grain, 1.0);
}`

const lyricSource = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_glyph;
uniform vec2 u_texel;
uniform float u_opacity;
uniform float u_progress;
out vec4 outColor;
void main() {
  float face = texture(u_glyph, v_uv).a;
  float depth = 0.0;
  for (int i = 1; i <= 16; i++) {
    vec2 shift = vec2(float(i) * u_texel.x * 1.35, -float(i) * u_texel.y * 1.45);
    depth = max(depth, texture(u_glyph, v_uv - shift).a * (1.0 - float(i) * .035));
  }
  float sweep = 1.0 - smoothstep(u_progress - .045, u_progress + .04, v_uv.x);
  vec3 bright = mix(vec3(.75,1.0,.96), vec3(.68,.78,1.0), smoothstep(.1,.9,v_uv.x));
  vec3 lit = mix(vec3(.53,.65,.72), bright, sweep);
  float bevel = max(face - texture(u_glyph, v_uv + vec2(2.0 * u_texel.x, -2.0 * u_texel.y)).a, 0.0);
  vec3 color = lit + bevel * vec3(.24,.29,.30);
  float alpha = max(face, depth * .9) * u_opacity;
  vec3 finalColor = mix(vec3(.075,.25,.38), color, face);
  outColor = vec4(finalColor * alpha, alpha);
}`

type CachedTexture = { texture: WebGLTexture; width: number; height: number }

function clamp(value: number, min = 0, max = 1) { return Math.max(min, Math.min(max, value)) }
function ease(value: number) { const x = clamp(value); return x * x * (3 - 2 * x) }

export class LyricStageRenderer {
  private readonly gl: WebGL2RenderingContext | null
  private readonly ctx: CanvasRenderingContext2D | null
  private readonly backgroundProgram: WebGLProgram | null = null
  private readonly lyricProgram: WebGLProgram | null = null
  private readonly quad: WebGLBuffer | null = null
  private readonly textures = new Map<number, CachedTexture>()
  private readonly uniforms = new WeakMap<WebGLProgram, Map<string, WebGLUniformLocation | null>>()
  private lines: StageLyric[]
  private width = 1
  private height = 1
  private dpr = 1

  constructor(private readonly canvas: HTMLCanvasElement, lines: StageLyric[]) {
    this.lines = lines
    this.gl = canvas.getContext('webgl2', { alpha: false, antialias: true, powerPreference: 'high-performance' })
    this.ctx = this.gl ? null : canvas.getContext('2d')
    if (this.gl) {
      this.backgroundProgram = this.createProgram(backgroundSource)
      this.lyricProgram = this.createProgram(lyricSource)
      this.quad = this.gl.createBuffer()
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quad)
      this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), this.gl.STATIC_DRAW)
    }
    this.resize()
  }

  setLines(lines: StageLyric[]) {
    this.lines = lines
    this.clearTextures()
  }

  resize() {
    const oldWidth = this.width
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.width = Math.max(1, Math.round(this.canvas.clientWidth * this.dpr))
    this.height = Math.max(1, Math.round(this.canvas.clientHeight * this.dpr))
    this.canvas.width = this.width
    this.canvas.height = this.height
    this.gl?.viewport(0, 0, this.width, this.height)
    if (oldWidth !== this.width) this.clearTextures()
  }

  render(timeMs: number, durationMs: number, reducedMotion: boolean) {
    const time = Math.max(0, timeMs)
    const index = this.activeIndex(time)
    const current = this.lines[index]
    const next = this.lines[index + 1]
    const end = next?.timeMs ?? Math.max(durationMs, (current?.timeMs ?? 0) + 4000)
    const lineDuration = current ? Math.max(650, end - current.timeMs) : 0
    const phase = current ? clamp((time - current.timeMs) / lineDuration) : 0
    const movement = index < 0 ? 0 : index + phase
    const camera = reducedMotion ? 0 : Math.cos(movement * Math.PI) * 76 * this.dpr
    const zoom = reducedMotion ? 1 : 1 + Math.sin(movement * Math.PI) ** 2 * .065

    if (this.gl && this.backgroundProgram && this.lyricProgram) {
      this.drawWebGLBackground(time, camera, zoom)
      if (current) {
        const transitionMs = Math.min(900, Math.max(450, lineDuration * .25))
        const remainingMs = end - time
        const exit = next && !reducedMotion ? ease((transitionMs - remainingMs) / (transitionMs * .55)) : 0
        const arrival = next && !reducedMotion ? ease((transitionMs * .65 - remainingMs) / (transitionMs * .65)) : 0
        const size = (this.canvas.clientWidth < 650 ? 63 : 104) * this.dpr
        this.gl.enable(this.gl.BLEND)
        this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA)
        this.use(this.lyricProgram)
        this.gl.uniform2f(this.uniform(this.lyricProgram, 'u_resolution'), this.width, this.height)
        this.gl.uniform1i(this.uniform(this.lyricProgram, 'u_glyph'), 0)
        this.drawWebGLLine(index, size, 1 - exit, reducedMotion ? 1 : Math.min(1, phase * 1.4), [-260 * exit * this.dpr, -35 * exit * this.dpr, 520 * exit * this.dpr, -.72 * exit], camera * .18, zoom)
        if (arrival > 0) this.drawWebGLLine(index + 1, size, arrival, arrival * .1, [420 * (1 - arrival) * this.dpr, 55 * (1 - arrival) * this.dpr, 780 * (1 - arrival) * this.dpr, .95 * (1 - arrival)], camera * .18, zoom)
        this.pruneTextures(new Set([index, index + 1]))
      }
    } else if (this.ctx) {
      this.drawFallback(time, index, end, reducedMotion)
    }
  }

  dispose() {
    if (!this.gl) return
    this.clearTextures()
    if (this.backgroundProgram) this.gl.deleteProgram(this.backgroundProgram)
    if (this.lyricProgram) this.gl.deleteProgram(this.lyricProgram)
    if (this.quad) this.gl.deleteBuffer(this.quad)
  }

  private activeIndex(timeMs: number) {
    let low = 0
    let high = this.lines.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (this.lines[middle]!.timeMs <= timeMs) low = middle + 1
      else high = middle
    }
    return low - 1
  }

  private createProgram(fragmentSource: string) {
    const gl = this.gl!
    const shader = (type: number, source: string) => {
      const result = gl.createShader(type)
      if (!result) throw new Error('无法创建歌词着色器')
      gl.shaderSource(result, source)
      gl.compileShader(result)
      if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result) ?? '歌词着色器编译失败')
      return result
    }
    const vertex = shader(gl.VERTEX_SHADER, vertexSource)
    const fragment = shader(gl.FRAGMENT_SHADER, fragmentSource)
    const result = gl.createProgram()
    if (!result) throw new Error('无法创建歌词渲染程序')
    gl.attachShader(result, vertex)
    gl.attachShader(result, fragment)
    gl.linkProgram(result)
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)
    if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(result) ?? '歌词渲染程序链接失败')
    return result
  }

  private uniform(program: WebGLProgram, name: string) {
    let locations = this.uniforms.get(program)
    if (!locations) { locations = new Map(); this.uniforms.set(program, locations) }
    if (!locations.has(name)) locations.set(name, this.gl!.getUniformLocation(program, name))
    return locations.get(name) ?? null
  }

  private use(program: WebGLProgram) {
    const gl = this.gl!
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    const location = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0)
  }

  private drawWebGLBackground(time: number, camera: number, zoom: number) {
    const gl = this.gl!
    const program = this.backgroundProgram!
    gl.disable(gl.BLEND)
    this.use(program)
    gl.uniform2f(this.uniform(program, 'u_resolution'), this.width, this.height)
    gl.uniform4f(this.uniform(program, 'u_rect'), 0, 0, this.width, this.height)
    gl.uniform4f(this.uniform(program, 'u_pose'), 0, 0, 0, 0)
    gl.uniform1f(this.uniform(program, 'u_time'), time)
    gl.uniform1f(this.uniform(program, 'u_camera'), camera)
    gl.uniform1f(this.uniform(program, 'u_zoom'), zoom)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  private drawWebGLLine(index: number, size: number, opacity: number, progress: number, pose: number[], camera: number, zoom: number) {
    const gl = this.gl!
    const program = this.lyricProgram!
    const item = this.getTexture(index)
    if (!item) return
    const scale = Math.min(size / 120, this.width * .86 / item.width)
    const width = item.width * scale
    const height = item.height * scale
    gl.bindTexture(gl.TEXTURE_2D, item.texture)
    gl.uniform4f(this.uniform(program, 'u_rect'), (this.width - width) / 2, (this.height - height) / 2, width, height)
    gl.uniform4f(this.uniform(program, 'u_pose'), pose[0]!, pose[1]!, pose[2]!, pose[3]!)
    gl.uniform1f(this.uniform(program, 'u_camera'), camera)
    gl.uniform1f(this.uniform(program, 'u_zoom'), zoom)
    gl.uniform2f(this.uniform(program, 'u_texel'), 1 / item.width, 1 / item.height)
    gl.uniform1f(this.uniform(program, 'u_opacity'), opacity)
    gl.uniform1f(this.uniform(program, 'u_progress'), progress)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  private getTexture(index: number) {
    const existing = this.textures.get(index)
    if (existing) return existing
    const line = this.lines[index]
    if (!line || !this.gl) return null
    const gl = this.gl
    const surface = document.createElement('canvas')
    const ctx = surface.getContext('2d')!
    ctx.font = '120px "Smiley Sans", "Noto Sans SC", sans-serif'
    ctx.letterSpacing = '8px'
    const maxWidth = this.canvas.clientWidth < 650 ? 660 : 1500
    const rows: string[] = []
    let row = ''
    for (const char of Array.from(line.text)) {
      if (row && ctx.measureText(row + char).width > maxWidth) { rows.push(row); row = char }
      else row += char
    }
    if (row) rows.push(row)
    surface.width = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, Math.ceil(Math.max(...rows.map((value) => ctx.measureText(value).width), 1) + 160))
    surface.height = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, rows.length * 138 + 100)
    ctx.font = '120px "Smiley Sans", "Noto Sans SC", sans-serif'
    ctx.letterSpacing = '8px'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#fff'
    rows.forEach((value, rowIndex) => ctx.fillText(value, surface.width / 2, 50 + 69 + rowIndex * 138, surface.width - 120))
    const texture = gl.createTexture()
    if (!texture) return null
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, surface)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const cached = { texture, width: surface.width, height: surface.height }
    this.textures.set(index, cached)
    return cached
  }

  private pruneTextures(keep: Set<number>) {
    if (!this.gl) return
    for (const [index, item] of this.textures) {
      if (keep.has(index)) continue
      this.gl.deleteTexture(item.texture)
      this.textures.delete(index)
    }
  }

  private clearTextures() { this.pruneTextures(new Set()) }

  private drawFallback(time: number, index: number, end: number, reducedMotion: boolean) {
    const ctx = this.ctx!
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    const background = ctx.createLinearGradient(0, 0, width, height)
    background.addColorStop(0, '#071e28')
    background.addColorStop(.55, '#06131f')
    background.addColorStop(1, '#111a3a')
    ctx.fillStyle = background
    ctx.fillRect(0, 0, width, height)
    const line = this.lines[index]
    if (!line) return
    const transitionMs = Math.min(900, Math.max(450, (end - line.timeMs) * .25))
    const remainingMs = end - time
    const exiting = !reducedMotion && this.lines[index + 1] ? ease((transitionMs - remainingMs) / (transitionMs * .55)) : 0
    const incoming = !reducedMotion && this.lines[index + 1] ? ease((transitionMs * .65 - remainingMs) / (transitionMs * .65)) : 0
    const draw = (text: string, alpha: number, x: number, scale: number) => {
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.translate(width / 2 + x, height / 2)
      ctx.scale(scale, scale)
      const fontSize = width < 650 ? 58 : 100
      ctx.font = `${fontSize}px "Smiley Sans", "Noto Sans SC", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const fill = ctx.createLinearGradient(-width * .35, 0, width * .35, 0)
      fill.addColorStop(0, '#c1fff6')
      fill.addColorStop(1, '#a2baff')
      ctx.fillStyle = fill
      ctx.shadowColor = '#14506f'
      ctx.shadowBlur = 22
      ctx.fillText(text, 0, 0, width * .86)
      ctx.restore()
    }
    draw(line.text, 1 - exiting, -220 * exiting, 1 - exiting * .4)
    if (incoming > 0) draw(this.lines[index + 1]!.text, incoming, 260 * (1 - incoming), .5 + .5 * incoming)
  }
}
