// KBO 10개 구단의 홈·원정 유니폼. Canvas도 셸도 모르는 순수 데이터다.
//
// 한 벌은 세 조각으로 나뉜다.
//   1. 격자(`torso`) — 가로 6 × 세로 9칸의 평평한 색면. 옷감 바탕색과 어깨 절개선처럼
//      네모로 떨어지는 것만 담는다.
//   2. 곡선(`stripe`·`panel`·`trim`·`collar`) — 격자에 넣으면 계단이 지는 것들.
//      그리는 쪽에서 몸통 모양으로 클립을 잡고 벡터로 긋는다.
//   3. 글씨(`mark`·`cap.mark`) — 가슴 워드마크와 모자 글씨. 예전엔 자리만 색 띠로
//      표시했는데, 띠는 어느 구단이든 똑같이 생겨서 결국 구단을 못 알아봤다.
//      상표 이미지를 쓰지 않고 텍스트로 찍는다.
//
// 색은 기억이 아니라 구단 공식 판매처 상품 사진의 픽셀에서 뽑았다.

export const GRID_W = 6
export const GRID_H = 9

/**
 * 바지 색. KBO는 홈·원정 가리지 않고 흰 긴바지를 입어서 구단별로 다르지 않다 —
 * 언젠가 갈리는 팀이 나오면 그때 키트 안으로 옮기면 된다.
 */
export const PANTS = '#F2F2F2'

const FIELD = (ch) => Array(GRID_H).fill(ch.repeat(GRID_W))

export const TEAMS = [
  {
    id: 'kia',
    name: 'KIA 타이거즈',
    kits: {
      // 흰 바탕에 옆구리 빨강 패널. 아래로 갈수록 넓어지고 단추 줄만 희게 남는다.
      home: {
        colors: { w: '#F2F2F2' },
        torso: FIELD('w'),
        panel: { color: '#C80828', style: 'sash' },
        mark: { text: 'TIGERS', color: '#181818', outline: '#C80828', style: 'slant' },
        base: '#F2F2F2',   // 소매를 칠할 옷감 색
        cap: { crown: '#C81838', bill: '#C81838', mark: 'T', markColor: '#181818', markOutline: '#F2F2F2' , glyph: 'wedge-t'},
      },
      // 검정 바탕에 같은 패널. 홈보다 빨강이 밝다.
      away: {
        colors: { k: '#282828' },
        torso: FIELD('k'),
        panel: { color: '#E8202C', style: 'sash' },
        mark: { text: 'TIGERS', color: '#F2F2F2', outline: '#E8202C', style: 'slant' },
        base: '#282828',   // 소매를 칠할 옷감 색
        cap: { crown: '#181818', bill: '#181818', mark: 'T', markColor: '#E8202C', markOutline: '#F2F2F2' , glyph: 'wedge-t'},
      },
    },
  },
  {
    id: 'samsung',
    name: '삼성 라이온즈',
    kits: {
      // 2026년에 빨간 라인을 빼고 파랑·흰색으로 돌아왔다.
      home: {
        colors: { w: '#F2F2F2' },
        torso: FIELD('w'),
        trim: ['#1848A8'],
        collar: true,
        mark: { text: 'Lions', color: '#1848A8', outline: '#F2F2F2', style: 'script' },
        base: '#F2F2F2',   // 소매를 칠할 옷감 색
        cap: { crown: '#0848A8', bill: '#0848A8', mark: 'SL', markColor: '#F2F2F2' , glyph: 'sl'},
      },
      away: {
        colors: { b: '#1848A8' },
        torso: FIELD('b'),
        trim: ['#F2F2F2'],
        collar: true,
        mark: { text: 'Lions', color: '#F2F2F2', outline: '#103070', style: 'script' },
        base: '#1848A8',   // 소매를 칠할 옷감 색
        cap: { crown: '#0848A8', bill: '#0848A8', mark: 'SL', markColor: '#F2F2F2' , glyph: 'sl'},
      },
    },
  },
  {
    id: 'lg',
    name: 'LG 트윈스',
    kits: {
      // 검정 핀스트라이프 + 어깨 검정 절개. 10구단에서 유일한 세로 줄무늬 홈이다.
      // 줄무늬는 격자에 넣지 않는다 — 6칸으로 쪼개면 검정이 절반을 먹어 굵어진다.
      home: {
        colors: { w: '#F2F2F2', k: '#181818' },
        torso: [
          'kkkkkk',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
        ],
        stripe: '#181818',
        mark: { text: 'TWINS', color: '#C8102E', outline: '#181818', style: 'block' },
        base: '#F2F2F2',   // 소매를 칠할 옷감 색
        cap: { crown: '#181818', bill: '#C8102E', mark: 'T', markColor: '#C8102E' , glyph: 'curl-t'},
      },
      away: {
        colors: { k: '#181818', w: '#F2F2F2' },
        torso: [
          'wwwwww',
          'kkkkkk',
          'kkkkkk',
          'kkkkkk',
          'kkkkkk',
          'kkkkkk',
          'kkkkkk',
          'kkkkkk',
          'kkkkkk',
        ],
        mark: { text: 'TWINS', color: '#C8102E', outline: '#F2F2F2', style: 'block' },
        base: '#181818',   // 소매를 칠할 옷감 색
        cap: { crown: '#181818', bill: '#C8102E', mark: 'T', markColor: '#C8102E' , glyph: 'curl-t'},
      },
    },
  },
  {
    id: 'doosan',
    name: '두산 베어스',
    kits: {
      // 무지에 가깝다. 가슴 스크립트의 남색 하나로만 갈린다.
      home: {
        colors: { w: '#F2F2F2' },
        torso: FIELD('w'),
        mark: { text: 'Bears', color: '#E4022D', outline: '#182838', style: 'script' },
        base: '#F2F2F2',   // 소매를 칠할 옷감 색
        cap: { crown: '#282848', bill: '#282848', mark: 'D', markColor: '#F2F2F2' , glyph: 'drop-d'},
      },
      away: {
        colors: { n: '#182838' },
        torso: FIELD('n'),
        mark: { text: 'Bears', color: '#F2F2F2', outline: '#E4022D', style: 'script' },
        base: '#182838',   // 소매를 칠할 옷감 색
        cap: { crown: '#282848', bill: '#282848', mark: 'D', markColor: '#F2F2F2' , glyph: 'drop-d'},
      },
    },
  },
  {
    id: 'kt',
    name: 'kt wiz',
    kits: {
      // 소매 끝 검정 라인 + 모자의 빨간 kt.
      home: {
        colors: { w: '#F2F2F2' },
        torso: FIELD('w'),
        trim: ['#181818'],
        mark: { text: 'KT WIZ', color: '#181818', style: 'slant' },
        base: '#F2F2F2',   // 소매를 칠할 옷감 색
        cap: { crown: '#181818', bill: '#181818', mark: 'kt', markColor: '#F2F2F2' , glyph: 'sharp-k'},
      },
      away: {
        colors: { k: '#181818' },
        torso: FIELD('k'),
        trim: ['#F2F2F2'],
        mark: { text: 'KT WIZ', color: '#F2F2F2', style: 'slant' },
        base: '#181818',   // 소매를 칠할 옷감 색
        cap: { crown: '#181818', bill: '#181818', mark: 'kt', markColor: '#F2F2F2' , glyph: 'sharp-k'},
      },
    },
  },
  {
    id: 'ssg',
    name: 'SSG 랜더스',
    kits: {
      // 목·소매 빨강 트림.
      home: {
        colors: { w: '#F2F2F2' },
        torso: FIELD('w'),
        trim: ['#C81828'],
        collar: true,
        mark: { text: 'Landers', color: '#C81828', outline: '#E8B830', style: 'script' },
        base: '#F2F2F2',   // 소매를 칠할 옷감 색
        cap: { crown: '#C81828', bill: '#C81828', mark: 'L', markColor: '#F2F2F2' , glyph: 'star-l', markAccent: '#E8B830'},
      },
      away: {
        colors: { r: '#C81828' },
        torso: FIELD('r'),
        trim: ['#F2F2F2'],
        collar: true,
        mark: { text: 'Landers', color: '#F2F2F2', outline: '#2E8B57', style: 'script' },
        base: '#C81828',   // 소매를 칠할 옷감 색
        cap: { crown: '#C81828', bill: '#C81828', mark: 'L', markColor: '#F2F2F2' , glyph: 'star-l', markAccent: '#E8B830'},
      },
    },
  },
  {
    id: 'lotte',
    name: '롯데 자이언츠',
    kits: {
      // 홈이 흰색이 아니라 아이보리다 — 10구단에서 여기뿐이다. 목·소매에 트림은 없다.
      home: {
        colors: { i: '#E8E8D8' },
        torso: FIELD('i'),
        mark: { text: 'Giants', color: '#D31145', outline: '#282838', style: 'slant' },
        base: '#E8E8D8',   // 소매를 칠할 옷감 색
        cap: { crown: '#383848', bill: '#383848', mark: 'G', markColor: '#D31145' , glyph: 'block-g'},
      },
      away: {
        colors: { n: '#282838' },
        torso: FIELD('n'),
        mark: { text: 'Giants', color: '#D31145', outline: '#F2F2F2', style: 'slant' },
        base: '#282838',   // 소매를 칠할 옷감 색
        cap: { crown: '#383848', bill: '#383848', mark: 'G', markColor: '#D31145' , glyph: 'block-g'},
      },
    },
  },
  {
    id: 'hanwha',
    name: '한화 이글스',
    kits: {
      // 무지 흰 바탕에 주황 스크립트 하나. 10구단 유일한 주황이다.
      home: {
        colors: { w: '#F2F2F2' },
        torso: FIELD('w'),
        mark: { text: 'Eagles', color: '#F85818', style: 'script' },
        base: '#F2F2F2',   // 소매를 칠할 옷감 색
        cap: { crown: '#282838', bill: '#282838', mark: 'E', markColor: '#F85818' , glyph: 'script-e'},
      },
      // 상품명은 '다크네이비'지만 실측은 거의 검정이다.
      away: {
        colors: { d: '#282828' },
        torso: FIELD('d'),
        mark: { text: 'EAGLES', color: '#F2F2F2', style: 'block' },
        base: '#282828',   // 소매를 칠할 옷감 색
        cap: { crown: '#282838', bill: '#282838', mark: 'E', markColor: '#F85818' , glyph: 'script-e'},
      },
    },
  },
  {
    id: 'nc',
    name: 'NC 다이노스',
    kits: {
      // 양 옆구리 패널 + 소매 금색 라인. 옆구리가 양쪽인 건 여기뿐이다.
      home: {
        colors: { w: '#F2F2F2' },
        torso: FIELD('w'),
        panel: { color: '#183848', style: 'sides' },
        trim: ['#C8A868'],
        mark: { text: 'Dinos', color: '#183848', outline: '#C8A868', style: 'slant' },
        base: '#F2F2F2',   // 소매를 칠할 옷감 색
        cap: { crown: '#183858', bill: '#183858', mark: 'D', markColor: '#C8A868' , glyph: 'round-d'},
      },
      away: {
        colors: { n: '#183848' },
        torso: FIELD('n'),
        panel: { color: '#90B8D8', style: 'sides' },
        trim: ['#C8A868'],
        mark: { text: 'Dinos', color: '#D8C49C', outline: '#183848', style: 'slant' },
        base: '#183848',   // 소매를 칠할 옷감 색
        cap: { crown: '#183858', bill: '#183858', mark: 'D', markColor: '#C8A868' , glyph: 'round-d'},
      },
    },
  },
  {
    id: 'kiwoom',
    name: '키움 히어로즈',
    kits: {
      // 보조색이 금색에서 핑크로 바뀌었다. 목·소매에 버건디+핑크 두 줄.
      home: {
        colors: { w: '#F2F2F2' },
        torso: FIELD('w'),
        trim: ['#582838', '#E890B0'],
        collar: true,
        mark: { text: 'KIWOOM', color: '#582838', outline: '#E890B0', style: 'slant' },
        base: '#F2F2F2',   // 소매를 칠할 옷감 색
        cap: { crown: '#481828', bill: '#481828', mark: 'K', markColor: '#F2F2F2' , glyph: 'blade-k'},
      },
      away: {
        colors: { u: '#582838' },
        torso: FIELD('u'),
        trim: ['#F2F2F2', '#E890B0'],
        collar: true,
        mark: { text: 'KIWOOM', color: '#F2F2F2', outline: '#E890B0', style: 'slant' },
        base: '#582838',   // 소매를 칠할 옷감 색
        cap: { crown: '#481828', bill: '#481828', mark: 'K', markColor: '#F2F2F2' , glyph: 'blade-k'},
      },
    },
  },
]

const BY_KEY = new Map()
for (const team of TEAMS) {
  BY_KEY.set(`${team.id}-home`, team.kits.home)
  BY_KEY.set(`${team.id}-away`, team.kits.away)
}

/** 'kia-home' 같은 키를 키트로. 모르는 키는 null — 유니폼 없음(검은 실루엣)으로 떨어진다. */
export function kitOf(key) {
  if (typeof key !== 'string') return null
  return BY_KEY.get(key) ?? null
}
