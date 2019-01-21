#ifdef GL_ES
precision mediump float;
#endif
 
varying vec2 v_tex_coords;
 
uniform sampler2D u_texture;
uniform vec4 u_tint;
 
void main() {
   vec4 tex = texture2D(u_texture, v_tex_coords) * u_tint;
   gl_FragColor = tex;
   gl_FragColor.rgb *= gl_FragColor.a;
}
