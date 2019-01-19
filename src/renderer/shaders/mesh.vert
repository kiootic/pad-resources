attribute vec4 a_position;
attribute vec2 a_tex_coords;
 
uniform mat4 u_transform;
 
varying vec2 v_tex_coords;
 
void main() {
   gl_Position = u_transform * a_position;
   v_tex_coords = a_tex_coords;
}
