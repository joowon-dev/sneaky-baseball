// KBO 10개 구단의 홈·원정 유니폼. Canvas도 셸도 모르는 순수 데이터다.
//
// 상의는 가로 6 × 세로 9칸 격자다. 1080 화면에서 몸통이 8×14px이라 이 정도가
// 들어간다 — 핀스트라이프, 옆구리 사선, 소매 트림 줄까지는 되고 로고는 안 된다.
// 0번 줄이 어깨, 2번 줄이 가슴 글씨 자리다. 가슴 글씨는 글자 모양이 아니라
// 그 자리의 색 띠로만 표현한다(상표를 그리지 않는다).
//
// 색은 기억이 아니라 구단 공식 판매처 상품 사진의 픽셀에서 뽑았다.

export const GRID_W = 6
export const GRID_H = 9

/**
 * 바지 색. KBO는 홈·원정 가리지 않고 흰 긴바지를 입어서 구단별로 다르지 않다 —
 * 언젠가 갈리는 팀이 나오면 그때 키트 안으로 옮기면 된다.
 */
export const PANTS = '#F2F2F2'

export const TEAMS = [
  {
    id: 'kia',
    name: 'KIA 타이거즈',
    kits: {
      // 흰 바탕에 옆구리 빨강 패널. 아래로 갈수록 넓어지고 단추 줄만 희게 남는다.
      home: {
        colors: { w: '#F2F2F2', r: '#C80828' },
        torso: [
          'wwwwww',
          'wwwwww',
          'wrrrrw',
          'wwwwww',
          'wwwwww',
          'rwwwwr',
          'rwwwwr',
          'rrwwrr',
          'rrwwrr',
        ],
        base: '#F2F2F2',   // 소매를 칠할 옷감 색
        cap: { crown: '#C81838', bill: '#C81838' },
      },
      // 검정 바탕에 같은 패널. 홈보다 빨강이 밝다.
      away: {
        colors: { k: '#282828', r: '#E8202C' },
        torso: [
          'kkkkkk',
          'kkkkkk',
          'krrrrk',
          'kkkkkk',
          'kkkkkk',
          'rkkkkr',
          'rkkkkr',
          'rrkkrr',
          'rrkkrr',
        ],
        base: '#282828',   // 소매를 칠할 옷감 색
        cap: { crown: '#181818', bill: '#181818' },
      },
    },
  },
  {
    id: 'samsung',
    name: '삼성 라이온즈',
    kits: {
      // 2026년에 빨간 라인을 빼고 파랑·흰색으로 돌아왔다.
      home: {
        colors: { w: '#F2F2F2', b: '#1848A8' },
        torso: [
          'bbbbbb',
          'wwwwww',
          'wbbbbw',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
        ],
        base: '#F2F2F2',   // 소매를 칠할 옷감 색
        cap: { crown: '#0848A8', bill: '#0848A8' },
      },
      away: {
        colors: { b: '#1848A8', w: '#F2F2F2' },
        torso: [
          'wwwwww',
          'bbbbbb',
          'bwwwwb',
          'bbbbbb',
          'bbbbbb',
          'bbbbbb',
          'bbbbbb',
          'bbbbbb',
          'bbbbbb',
        ],
        base: '#1848A8',   // 소매를 칠할 옷감 색
        cap: { crown: '#0848A8', bill: '#0848A8' },
      },
    },
  },
  {
    id: 'lg',
    name: 'LG 트윈스',
    kits: {
      // 검정 핀스트라이프 + 어깨 검정 3선. 10구단에서 유일한 세로 줄무늬 홈이다.
      // 줄무늬는 격자에 넣지 않는다 — 6칸으로 쪼개면 검정이 절반을 먹어 굵어진다.
      home: {
        colors: { w: '#F2F2F2', k: '#181818', r: '#C8102E' },
        torso: [
          'kkkkkk',
          'wwwwww',
          'wrrrrw',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
        ],
        stripe: '#181818',
        base: '#F2F2F2',   // 소매를 칠할 옷감 색
        cap: { crown: '#181818', bill: '#181818' },
      },
      away: {
        colors: { k: '#181818', w: '#F2F2F2', r: '#C8102E' },
        torso: [
          'wwwwww',
          'kkkkkk',
          'krrrrk',
          'kkkkkk',
          'kkkkkk',
          'kkkkkk',
          'kkkkkk',
          'kkkkkk',
          'kkkkkk',
        ],
        base: '#181818',   // 소매를 칠할 옷감 색
        cap: { crown: '#181818', bill: '#181818' },
      },
    },
  },
  {
    id: 'doosan',
    name: '두산 베어스',
    kits: {
      // 무지에 가깝다. 가슴 스크립트의 남색과 빨강 포인트로만 갈린다.
      home: {
        colors: { w: '#F2F2F2', n: '#182838', r: '#E4022D' },
        torso: [
          'wwwwww',
          'wwwwww',
          'wnnrnw',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
        ],
        base: '#F2F2F2',   // 소매를 칠할 옷감 색
        cap: { crown: '#282848', bill: '#282848' },
      },
      away: {
        colors: { n: '#182838', w: '#F2F2F2', r: '#E4022D' },
        torso: [
          'nnnnnn',
          'nnnnnn',
          'nwwrwn',
          'nnnnnn',
          'nnnnnn',
          'nnnnnn',
          'nnnnnn',
          'nnnnnn',
          'nnnnnn',
        ],
        base: '#182838',   // 소매를 칠할 옷감 색
        cap: { crown: '#282848', bill: '#282848' },
      },
    },
  },
  {
    id: 'kt',
    name: 'kt wiz',
    kits: {
      // 소매 끝 검정 라인 + 가슴 글씨의 빨강 별.
      home: {
        colors: { w: '#F2F2F2', k: '#181818', r: '#E8202C' },
        torso: [
          'kkkkkk',
          'wwwwww',
          'wkkrkw',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
        ],
        base: '#F2F2F2',   // 소매를 칠할 옷감 색
        cap: { crown: '#181818', bill: '#181818' },
      },
      away: {
        colors: { k: '#181818', w: '#F2F2F2', r: '#E8202C' },
        torso: [
          'wwwwww',
          'kkkkkk',
          'kwwrwk',
          'kkkkkk',
          'kkkkkk',
          'kkkkkk',
          'kkkkkk',
          'kkkkkk',
          'kkkkkk',
        ],
        base: '#181818',   // 소매를 칠할 옷감 색
        cap: { crown: '#181818', bill: '#181818' },
      },
    },
  },
  {
    id: 'ssg',
    name: 'SSG 랜더스',
    kits: {
      // 목·소매 빨강 트림. 가슴 글씨에 노랑 그라데이션이 섞인다.
      home: {
        colors: { w: '#F2F2F2', r: '#C81828', y: '#E8B830' },
        torso: [
          'rrrrrr',
          'wwwwww',
          'wrryrw',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
        ],
        base: '#F2F2F2',   // 소매를 칠할 옷감 색
        cap: { crown: '#C81828', bill: '#C81828' },
      },
      away: {
        colors: { r: '#C81828', w: '#F2F2F2', e: '#2E8B57' },
        torso: [
          'wwwwww',
          'rrrrrr',
          'rwwewr',
          'rrrrrr',
          'rrrrrr',
          'rrrrrr',
          'rrrrrr',
          'rrrrrr',
          'rrrrrr',
        ],
        base: '#C81828',   // 소매를 칠할 옷감 색
        cap: { crown: '#C81828', bill: '#C81828' },
      },
    },
  },
  {
    id: 'lotte',
    name: '롯데 자이언츠',
    kits: {
      // 홈이 흰색이 아니라 아이보리다 — 10구단에서 여기뿐이다. 목·소매에 트림은 없다.
      home: {
        colors: { i: '#E8E8D8', r: '#D31145' },
        torso: [
          'iiiiii',
          'iiiiii',
          'irrrri',
          'iiiiii',
          'iiiiii',
          'iiiiii',
          'iiiiii',
          'iiiiii',
          'iiiiii',
        ],
        base: '#E8E8D8',   // 소매를 칠할 옷감 색
        cap: { crown: '#383848', bill: '#383848' },
      },
      away: {
        colors: { n: '#282838', r: '#D31145' },
        torso: [
          'nnnnnn',
          'nnnnnn',
          'nrrrrn',
          'nnnnnn',
          'nnnnnn',
          'nnnnnn',
          'nnnnnn',
          'nnnnnn',
          'nnnnnn',
        ],
        base: '#282838',   // 소매를 칠할 옷감 색
        cap: { crown: '#383848', bill: '#383848' },
      },
    },
  },
  {
    id: 'hanwha',
    name: '한화 이글스',
    kits: {
      // 무지 흰 바탕에 주황 스크립트 하나. 10구단 유일한 주황이다.
      home: {
        colors: { w: '#F2F2F2', o: '#F85818' },
        torso: [
          'wwwwww',
          'wwwwww',
          'woooow',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
        ],
        base: '#F2F2F2',   // 소매를 칠할 옷감 색
        cap: { crown: '#282838', bill: '#282838' },
      },
      // 상품명은 '다크네이비'지만 실측은 거의 검정이다.
      away: {
        colors: { d: '#282828', w: '#F2F2F2' },
        torso: [
          'dddddd',
          'dddddd',
          'dwwwwd',
          'dddddd',
          'dddddd',
          'dddddd',
          'dddddd',
          'dddddd',
          'dddddd',
        ],
        base: '#282828',   // 소매를 칠할 옷감 색
        cap: { crown: '#282838', bill: '#282838' },
      },
    },
  },
  {
    id: 'nc',
    name: 'NC 다이노스',
    kits: {
      // 양 옆구리 패널 + 소매 금색 라인. 옆구리가 양쪽인 건 여기뿐이다.
      home: {
        colors: { w: '#F2F2F2', n: '#183848', g: '#C8A868' },
        torso: [
          'gggggg',
          'wwwwww',
          'wnnnnw',
          'nwwwwn',
          'nwwwwn',
          'nwwwwn',
          'nwwwwn',
          'nwwwwn',
          'nwwwwn',
        ],
        base: '#F2F2F2',   // 소매를 칠할 옷감 색
        cap: { crown: '#183858', bill: '#183858' },
      },
      away: {
        colors: { n: '#183848', g: '#C8A868', s: '#90B8D8' },
        torso: [
          'gggggg',
          'nnnnnn',
          'nggggn',
          'snnnns',
          'snnnns',
          'snnnns',
          'snnnns',
          'snnnns',
          'snnnns',
        ],
        base: '#183848',   // 소매를 칠할 옷감 색
        cap: { crown: '#183858', bill: '#183858' },
      },
    },
  },
  {
    id: 'kiwoom',
    name: '키움 히어로즈',
    kits: {
      // 보조색이 금색에서 핑크로 바뀌었다. 목·소매에 버건디+핑크 두 줄.
      home: {
        colors: { w: '#F2F2F2', u: '#582838', p: '#E890B0' },
        torso: [
          'uuuuuu',
          'pppppp',
          'wuuuuw',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
        ],
        base: '#F2F2F2',   // 소매를 칠할 옷감 색
        cap: { crown: '#481828', bill: '#481828' },
      },
      away: {
        colors: { u: '#582838', w: '#F2F2F2', p: '#E890B0' },
        torso: [
          'wwwwww',
          'pppppp',
          'uwwwwu',
          'uuuuuu',
          'uuuuuu',
          'uuuuuu',
          'uuuuuu',
          'uuuuuu',
          'uuuuuu',
        ],
        base: '#582838',   // 소매를 칠할 옷감 색
        cap: { crown: '#481828', bill: '#481828' },
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
