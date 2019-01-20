precision mediump float;
 
varying vec2 v_tex_coords;
 
uniform sampler2D u_texture;
 
void main() {
   vec4 tex = texture2D(u_texture, v_tex_coords);
   gl_FragColor = tex;
   gl_FragColor.rgb *= gl_FragColor.a;
}
