import { dailyPassage } from "@/app/lib/daily/passage";
import { isTranslationPreference } from "@/app/lib/translationPreference";
export async function GET(request: Request) {
    const p = new URL(request.url).searchParams;
    const t = p.get('translation');
    if (!isTranslationPreference(t))
        return Response.json({ status: 'invalid-request' }, { status: 400 });
    try {
        const passage = dailyPassage(p.get('date') || '', t);
        return Response.json(passage || { status: 'invalid-date' }, { status: passage ? 200 : 400, headers: { 'Cache-Control': 'public, max-age=300' } });
    }
    catch {
        return Response.json({ status: 'scripture-unavailable' }, { status: 503 });
    }
}
