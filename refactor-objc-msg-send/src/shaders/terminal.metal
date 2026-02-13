#include <metal_stdlib>
using namespace metal;

struct VertexIn {
    float2 position [[attribute(0)]];
    float2 texcoord [[attribute(1)]];
    float4 fg_color [[attribute(2)]];
    float4 bg_color [[attribute(3)]];
    float  is_bg    [[attribute(4)]];  // 1.0 for background pass, 0.0 for glyph pass
};

struct VertexOut {
    float4 position [[position]];
    float2 texcoord;
    float4 fg_color;
    float4 bg_color;
    float  is_bg;
};

struct Uniforms {
    float2 viewport_size;
};

vertex VertexOut vertex_main(VertexIn in [[stage_in]],
                             constant Uniforms &uniforms [[buffer(1)]]) {
    VertexOut out;
    // Convert pixel coordinates to clip space (-1..1)
    float2 ndc = (in.position / uniforms.viewport_size) * 2.0 - 1.0;
    ndc.y = -ndc.y;  // Flip Y (screen coords: top-left origin)
    out.position = float4(ndc, 0.0, 1.0);
    out.texcoord = in.texcoord;
    out.fg_color = in.fg_color;
    out.bg_color = in.bg_color;
    out.is_bg = in.is_bg;
    return out;
}

fragment float4 fragment_main(VertexOut in [[stage_in]],
                              texture2d<float> atlas [[texture(0)]],
                              sampler samp [[sampler(0)]]) {
    if (in.is_bg > 0.5) {
        return in.bg_color;
    }

    float4 tex_color = atlas.sample(samp, in.texcoord);
    // Use the texture's alpha (from premultiplied RGBA) to blend glyph
    float alpha = tex_color.a;
    if (alpha < 0.01) {
        discard_fragment();
    }
    return float4(in.fg_color.rgb * alpha, alpha);
}
