import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif']);
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'heic', 'heif']);

const DISCLAIMER =
  '이 분석은 전통 관상학 관점의 엔터테인먼트 콘텐츠이며, 의학적·과학적 진단이 아닙니다. 인종, 종교, 정치성향, 성적지향, 건강 상태를 추정하지 않습니다.';

const SYSTEM_PROMPT = `너는 전통 관상학 관점에서 얼굴 인상을 해석하는 콘텐츠 작가다.

절대 금지 사항:
- 인종, 민족, 출신 지역 추정 금지
- 종교, 정치 성향 추정 금지
- 성적 지향 추정 금지
- 건강 상태, 질병 진단 금지
- 나이 추정 금지
- 부정적이거나 비하하는 표현 금지

분석 범위 (허용):
- 눈: 인상, 에너지
- 코: 안정감, 의지
- 입: 표현력, 소통
- 전체 인상: 에너지, 분위기
- 성향 경향: 정확히 3가지

톤: 따뜻하고 긍정적, 한국어
분량: 200~400자

반드시 아래 JSON 형식으로만 답변해라 (다른 텍스트 없이):
{
  "summary": "전체 인상 요약 (2~3문장)",
  "features": {
    "eyes": "눈에 대한 관상 해석",
    "nose": "코에 대한 관상 해석",
    "mouth": "입에 대한 관상 해석",
    "overall": "전체 인상 해석"
  },
  "energy": "이 사람에게서 느껴지는 에너지 (1~2문장)",
  "personality": ["성향1", "성향2", "성향3"]
}`;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const consent = formData.get('consent');
    const imageFile = formData.get('image');

    if (consent !== 'true') {
      return Response.json(
        { success: false, error: '관상 분석을 위해 디스클레이머 동의가 필요합니다.' },
        { status: 400 },
      );
    }

    if (!imageFile || !(imageFile instanceof File)) {
      return Response.json(
        { success: false, error: '얼굴 사진을 업로드해주세요.' },
        { status: 400 },
      );
    }

    // Validate file
    if (imageFile.size > MAX_IMAGE_SIZE) {
      return Response.json(
        { success: false, error: `파일 크기가 너무 큽니다 (최대 ${MAX_IMAGE_SIZE / 1024 / 1024}MB).` },
        { status: 400 },
      );
    }

    const ext = imageFile.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_TYPES.has(imageFile.type) && !ALLOWED_EXTENSIONS.has(ext)) {
      return Response.json(
        { success: false, error: '허용되지 않는 파일 형식입니다 (JPG, PNG만 가능).' },
        { status: 400 },
      );
    }

    // Convert to base64
    const buffer = Buffer.from(await imageFile.arrayBuffer());
    const base64 = buffer.toString('base64');
    const mimeType = imageFile.type || 'image/jpeg';
    const dataUrl = `data:${mimeType};base64,${base64}`;

    // Call OpenAI Vision API
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 800,
      temperature: 0.7,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: '이 얼굴 사진을 전통 관상학 관점에서 분석해주세요.' },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
          ],
        },
      ],
    });

    const raw = response.choices?.[0]?.message?.content?.trim() ?? '';
    if (!raw) {
      throw new Error('AI 응답이 비어 있습니다.');
    }

    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
      return Response.json({
        success: true,
        result: { ...parsed, disclaimer: DISCLAIMER },
      });
    } catch {
      return Response.json({
        success: true,
        result: {
          summary: raw,
          features: {
            eyes: '분석 결과를 요약에서 확인해주세요.',
            nose: '분석 결과를 요약에서 확인해주세요.',
            mouth: '분석 결과를 요약에서 확인해주세요.',
            overall: raw,
          },
          energy: '분석 완료',
          personality: ['관상 분석 결과 참고'],
          disclaimer: DISCLAIMER,
        },
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '관상 분석 중 오류가 발생했습니다.';
    console.error('[face-analysis] Error:', message);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
