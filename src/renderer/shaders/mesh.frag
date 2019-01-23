#ifdef GL_ES
precision mediump float;
#endif
 
varying vec2 v_tex_coords;
 
uniform sampler2D u_texture;
uniform vec4 u_tint;
uniform bool u_additive;
 
void main() {
   vec4 tex = texture2D(u_texture, v_tex_coords) * u_tint;
   tex.rgb *= tex.a;

   if (u_additive) {
      float m = max(max(tex.r, tex.g), tex.b);
      tex.a = m;
   }

   gl_FragColor = tex;
}
