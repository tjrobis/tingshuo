// Curated seed curriculum, designed backward from milestone M1 (a 5-minute conversation):
// units 1–11 cover it, unit 12 adds getting around. Authored with AI assistance; machine-checked
// by src/lib/curriculum.test.ts (pinyin cross-checked against pinyin-pro, every sentence token in
// the lexicon, no sentence using a word before its unit). Native-speaker review is still pending.
//
// Format: pipe-separated columns, `# N` starts unit N, blank lines and `//` lines are ignored.
// Pinyin uses tone numbers in citation form (0 = neutral); sandhi is computed, never typed.

// hanzi | pinyin | meanings (;) | part of speech | frequency band 1–5 | topics (,) | emoji | note
export const LEXICON = `
# 1
你|ni3|you|pron|1|people
我|wo3|I;me|pron|1|people
他|ta1|he;him|pron|1|people
她|ta1|she;her|pron|1|people
好|hao3|good;well;fine|adj|1|core|👍
你好|ni3 hao3|hello;hi|phr|1|greet|👋|Two 3rd tones in a row: said ní hǎo.
很|hen3|very;quite|adv|1|core||Often just links subject and adjective without meaning "very".
是|shi4|to be;am;is;are;yes|v|1|core
不|bu4|not;no|adv|1|core||Said bú before a 4th tone: 不是 búshì.
吗|ma0|question particle;question marker|part|1|core||Add it to the end of a statement to make a yes/no question.
谢谢|xie4 xie0|thank you;thanks|phr|1|greet|🙏
不客气|bu4 ke4 qi0|you're welcome;no problem;don't mention it|phr|1|greet||Said bú kèqi.
对不起|dui4 bu0 qi3|sorry;I'm sorry;excuse me|phr|1|greet
没关系|mei2 guan1 xi0|it's okay;it doesn't matter;no problem;never mind|phr|1|greet
再见|zai4 jian4|goodbye;bye;see you|phr|1|greet|👋
呢|ne0|and you;what about;how about|part|1|core||Bounces a question back: 你呢？ = and you?
也|ye3|also;too|adv|1|core
我们|wo3 men0|we;us|pron|1|people
你们|ni3 men0|you (plural);you all;you guys|pron|1|people
他们|ta1 men0|they;them|pron|1|people
老师|lao3 shi1|teacher|n|1|school|🧑‍🏫
学生|xue2 sheng0|student|n|1|school|🧑‍🎓

# 2
叫|jiao4|to be called;to call;called|v|1|people
什么|shen2 me0|what|q|1|core
名字|ming2 zi0|name|n|1|people
认识|ren4 shi0|to know (someone);to meet;to get to know|v|1|people
高兴|gao1 xing4|happy;glad|adj|2|people|😊
人|ren2|person;people|n|1|people|🧍
中国|zhong1 guo2|China|n|1|travel,culture|🇨🇳
美国|mei3 guo2|America;USA;the US;United States|n|2|travel|🇺🇸
哪|na3|which|q|1|core
国|guo2|country;nation|n|2|travel
中文|zhong1 wen2|Chinese;Chinese language|n|1|lang
英文|ying1 wen2|English;English language|n|2|lang
说|shuo1|to speak;to say;speak;say|v|1|lang|🗣️
会|hui4|can (know how to);to be able to;can|v|1|core||A learned skill. Compare 能 and 可以.
一点|yi1 dian3|a little;a bit|phr|1|core||Said yìdiǎn.
朋友|peng2 you0|friend|n|1|people,dating|🤝
小明|xiao3 ming2|Xiaoming|name|5|people
李华|li3 hua2|Li Hua|name|5|people

# 3
请|qing3|please;to invite|v|1|repair|🙏
再|zai4|again|adv|1|repair|🔁
一|yi1|one|num|1|numbers|1️⃣|Said yí before a 4th tone, yì before others, yī when counting.
遍|bian4|time (occurrence);times|mw|2|repair||Counts complete run-throughs: 一遍 = once.
慢|man4|slow;slowly|adj|1|repair|🐢
听|ting1|to listen;listen;to hear|v|1|repair|👂
懂|dong3|to understand;understand|v|1|repair|💡
意思|yi4 si0|meaning|n|1|repair
怎么|zen3 me0|how|q|1|repair
用|yong4|to use;use;with|v|1|repair
知道|zhi1 dao4|to know (a fact);know|v|1|core|🤔
问|wen4|to ask;ask|v|1|repair
可以|ke3 yi3|can (may);may;to be allowed to|v|1|core||Permission. Said kéyǐ.
对|dui4|correct;right;yes|adj|1|core|✅
等|deng3|to wait;wait|v|1|repair|⏳
一下|yi1 xia4|a moment;a bit;once|phr|1|repair||Said yíxià. After a verb it makes the action short and casual.

# 4
二|er4|two|num|1|numbers|2️⃣
三|san1|three|num|1|numbers|3️⃣
四|si4|four|num|1|numbers|4️⃣
五|wu3|five|num|1|numbers|5️⃣
六|liu4|six|num|1|numbers|6️⃣
七|qi1|seven|num|1|numbers|7️⃣
八|ba1|eight|num|1|numbers|8️⃣
九|jiu3|nine|num|1|numbers|9️⃣
十|shi2|ten|num|1|numbers|🔟
零|ling2|zero|num|2|numbers|0️⃣
两|liang3|two (of something);two|num|1|numbers||Before measure words: 两个人. Use 二 when counting.
几|ji3|how many;a few|q|1|numbers
岁|sui4|years old;years of age|mw|1|numbers|🎂
多|duo1|many;much;how (old, big)|adj|1|core
大|da4|big;large;old (age)|adj|1|core
今年|jin1 nian2|this year|t|1|time|📅
年|nian2|year|n|1|time
个|ge4|measure word;general measure word;classifier|mw|1|core||The all-purpose measure word; usually said lightly.
多少|duo1 shao0|how many;how much|q|1|numbers|🔢

# 5
有|you3|to have;have;there is;there are|v|1|core
喜欢|xi3 huan0|to like;like|v|1|hobbies|❤️
爱|ai4|to love;love|v|1|dating|💕
玩|wan2|to play;play;to have fun|v|1|hobbies,gaming
游戏|you2 xi4|game;video game;games|n|2|gaming|🎮
打|da3|to hit;to play (games, ball sports);play|v|1|gaming||打游戏 = play video games.
看|kan4|to look;to watch;to read;look;watch;see|v|1|hobbies|👀
电影|dian4 ying3|movie;film|n|1|hobbies|🎬
音乐|yin1 yue4|music|n|2|hobbies|🎵
书|shu1|book|n|1|school,hobbies|📖
运动|yun4 dong4|sports;exercise;to exercise|n|2|outdoors|⚽
跑步|pao3 bu4|to run;running;to jog|v|2|outdoors|🏃
爬山|pa2 shan1|to hike;to climb mountains;hiking;mountain climbing|v|3|outdoors|⛰️
唱歌|chang4 ge1|to sing;singing;sing|v|2|hobbies|🎤
手机|shou3 ji1|mobile phone;cell phone;phone;smartphone|n|1|tech|📱
电脑|dian4 nao3|computer;laptop|n|1|tech|💻
都|dou1|all;both|adv|1|core
非常|fei1 chang2|extremely;very;really|adv|1|core
太|tai4|too;so;extremely|adv|1|core
了|le0|particle;completion particle;change particle|part|1|core||Marks completion or a new situation. It is not a past tense.
爱好|ai4 hao4|hobby;interest|n|2|hobbies

# 6
没|mei2|not;didn't;haven't|adv|1|core||Negates 有 and things that happened. 不 negates habits and the future.
没有|mei2 you3|not have;don't have;there isn't;didn't|v|1|core
问题|wen4 ti2|question;problem|n|1|core
家|jia1|home;family;house|n|1|family|🏠
爸爸|ba4 ba0|dad;father|n|1|family|👨
妈妈|ma1 ma0|mom;mother;mum|n|1|family|👩
哥哥|ge1 ge0|older brother;elder brother|n|2|family
姐姐|jie3 jie0|older sister;elder sister|n|2|family
弟弟|di4 di0|younger brother;little brother|n|2|family
妹妹|mei4 mei0|younger sister;little sister|n|2|family
狗|gou3|dog|n|2|family|🐶
猫|mao1|cat|n|2|family|🐱
只|zhi1|measure word for animals;measure word|mw|2|family||一只狗 = a dog.
口|kou3|mouth;measure word for family members|n|2|family|👄
小|xiao3|small;little;young|adj|1|core
女朋友|nü3 peng2 you0|girlfriend|n|2|dating|💑
男朋友|nan2 peng2 you0|boyfriend|n|2|dating|💑
和|he2|and;with|conj|1|core||Joins nouns only, never two sentences.
的|de0|'s;of;possessive particle|part|1|core
大家|da4 jia1|everyone;everybody|pron|1|people|👥

# 7
吃|chi1|to eat;eat|v|1|food|🍽️
喝|he1|to drink;drink|v|1|food|🥤
饭|fan4|meal;cooked rice;food|n|1|food|🍚
米饭|mi3 fan4|rice;cooked rice;steamed rice|n|2|food|🍚
面|mian4|noodles;noodle|n|2|food|🍜
饺子|jiao3 zi0|dumplings;dumpling|n|2|food,culture|🥟
菜|cai4|dish;vegetable;food;vegetables|n|1|food|🥬
水|shui3|water|n|1|food|💧
茶|cha2|tea|n|1|food,culture|🍵
咖啡|ka1 fei1|coffee|n|2|food|☕
啤酒|pi2 jiu3|beer|n|2|food|🍺
杯|bei1|cup;glass;cup of;glass of|mw|2|food|🥛
碗|wan3|bowl;bowl of|mw|2|food|🥣
要|yao4|to want;want;will have;need|v|1|core
想|xiang3|would like;to want;to think;to miss|v|1|core
好吃|hao3 chi1|delicious;tasty|adj|1|food|😋
辣|la4|spicy;hot (spicy)|adj|2|food|🌶️
这|zhe4|this|pron|1|core|👇
那|na4|that|pron|1|core|👉
这个|zhe4 ge0|this;this one|pron|1|core
那个|na4 ge0|that;that one|pron|1|core
服务员|fu2 wu4 yuan2|waiter;waitress;server;attendant|n|2|food|💁
买单|mai3 dan1|the check please;check please;bill please;pay the bill|phr|2|food|🧾
饿|e4|hungry|adj|2|food|😫

# 8
钱|qian2|money|n|1|shopping|💰
块|kuai4|yuan;kuai;dollar;piece|mw|1|shopping|💴|Everyday word for yuan; price tags say 元.
买|mai3|to buy;buy|v|1|shopping|🛍️
卖|mai4|to sell;sell|v|1|shopping
贵|gui4|expensive;pricey|adj|1|shopping|💸
便宜|pian2 yi0|cheap;inexpensive|adj|1|shopping
吧|ba0|let's;suggestion particle|part|1|core||Softens a sentence into a suggestion.
衣服|yi1 fu0|clothes;clothing|n|1|shopping|👕
件|jian4|measure word for clothes;item;piece|mw|2|shopping
东西|dong1 xi0|thing;things;stuff|n|1|shopping|📦
商店|shang1 dian4|shop;store|n|2|shopping|🏪
能|neng2|can (be able to);able to;can|v|1|core||Ability or possibility. Compare 会 and 可以.
给|gei3|to give;give;for|v|1|core|🎁

# 9
今天|jin1 tian1|today|t|1|time|📅
明天|ming2 tian1|tomorrow|t|1|time
昨天|zuo2 tian1|yesterday|t|1|time
现在|xian4 zai4|now;right now|t|1|time|⏰
早上|zao3 shang0|morning;in the morning|t|1|time|🌅
晚上|wan3 shang0|evening;night;in the evening|t|1|time|🌙
点|dian3|o'clock;dot;point|mw|1|time|🕒
半|ban4|half;half past|num|1|time
星期|xing1 qi1|week|n|1|time|🗓️|星期一 Monday … 星期六 Saturday; 星期天 Sunday.
周末|zhou1 mo4|weekend|n|2|time
时候|shi2 hou0|time;when;moment|n|1|time
时间|shi2 jian1|time;free time|n|1|time|⌛
忙|mang2|busy|adj|1|time
天|tian1|day;sky|n|1|time|☀️
每|mei3|every;each|pron|1|time

# 10
去|qu4|to go;go|v|1|places|➡️
来|lai2|to come;come|v|1|places
在|zai4|at;in;to be at;to be in|prep|1|places|📍
哪儿|na3 r0|where|q|1|places||Northern form of 哪里; both are understood everywhere.
哪里|na3 li3|where|q|1|places||Said nálǐ.
这儿|zhe4 r0|here|pron|1|places
那儿|na4 r0|there|pron|1|places
住|zhu4|to live;live;to stay|v|1|places|🏡
工作|gong1 zuo4|to work;work;job|v|1|places|💼
学校|xue2 xiao4|school|n|1|school|🏫
大学|da4 xue2|university;college|n|1|school|🎓
公司|gong1 si1|company;office;firm|n|1|places|🏢
学习|xue2 xi2|to study;study;to learn|v|1|school|📚
北京|bei3 jing1|Beijing|n|2|travel,culture
上海|shang4 hai3|Shanghai|n|2|travel
回|hui2|to return;to go back;return|v|1|places|↩️

# 11
做|zuo4|to do;to make;do;make|v|1|core
打算|da3 suan4|to plan;to intend;plan|v|2|plans|📝
一起|yi1 qi3|together|adv|1|dating,people||Said yìqǐ.
觉得|jue2 de0|to think;to feel;think;feel|v|1|core|💭
怎么样|zen3 me0 yang4|how about;how is it;what do you think;how|q|1|core
可能|ke3 neng2|maybe;possibly;might|adv|1|core
已经|yi3 jing1|already|adv|1|core
还|hai2|still;yet;also|adv|1|core
睡觉|shui4 jiao4|to sleep;to go to bed;sleep|v|1|time|😴
起床|qi3 chuang2|to get up;get up;to wake up|v|2|time|⏰
见|jian4|to see;to meet;see|v|1|people
见面|jian4 mian4|to meet;to meet up;meet up|v|2|dating|🤝

# 12
坐|zuo4|to sit;to take (transport);to ride;take|v|1|travel|🪑
地铁|di4 tie3|subway;metro;underground|n|2|travel|🚇
出租车|chu1 zu1 che1|taxi;cab|n|2|travel|🚕
飞机|fei1 ji1|plane;airplane|n|2|travel|✈️
火车|huo3 che1|train|n|2|travel|🚆
机场|ji1 chang3|airport|n|2|travel|🛫
酒店|jiu3 dian4|hotel|n|2|travel|🏨
远|yuan3|far|adj|1|travel
近|jin4|near;close|adj|1|travel
走|zou3|to walk;to go;to leave;walk|v|1|travel|🚶
左|zuo3|left|n|2|travel|⬅️
右|you4|right|n|2|travel|➡️
左边|zuo3 bian0|left side;on the left;left|n|2|travel
右边|you4 bian0|right side;on the right;right|n|2|travel
往|wang3|toward;towards;to|prep|2|travel
到|dao4|to arrive;to;until;arrive|v|1|travel
从|cong2|from|prep|1|travel
洗手间|xi3 shou3 jian1|restroom;bathroom;toilet;washroom|n|2|travel|🚻
帮|bang1|to help;help|v|1|people|🆘
旅行|lü3 xing2|to travel;travel;trip|v|2|travel|🧳
`;

// Chinese, tokens separated by spaces | English translations separated by " / " | grammar ids (,)
export const SENTENCES = `
# 1
你好 ！|Hello!
你 好 吗 ？|How are you? / Are you well?|g:ma
我 很 好 ， 谢谢 。|I'm fine, thanks. / I'm fine, thank you. / I am very well, thank you.|g:hen
你 呢 ？|And you? / What about you? / How about you?|g:ne
我 也 很 好 。|I'm fine too. / I'm also fine. / I am also well.|g:ye,g:hen
我 是 学生 。|I'm a student. / I am a student.|g:shi
他 是 老师 。|He's a teacher. / He is a teacher.|g:shi
她 是 老师 吗 ？|Is she a teacher?|g:ma
她 不 是 老师 ， 她 是 学生 。|She isn't a teacher, she's a student. / She is not a teacher, she is a student.|g:bu,g:shi
你们 是 学生 吗 ？|Are you students? / Are you all students?|g:ma
我们 不 是 学生 。|We aren't students. / We are not students.|g:bu
他们 也 是 老师 。|They're teachers too. / They are also teachers.|g:ye
谢谢 你 ！|Thank you! / Thanks!
不客气 。|You're welcome. / No problem.
对不起 ！|Sorry! / I'm sorry!
没关系 。|It's OK. / It's okay. / No problem. / That's alright. / It doesn't matter.
再见 ！|Goodbye! / Bye! / See you!

# 2
你 叫 什么 名字 ？|What's your name? / What is your name?|g:shenme,g:jiao
我 叫 小明 。|My name is Xiaoming. / I'm called Xiaoming. / I'm Xiaoming.|g:jiao
他 叫 什么 ？|What's he called? / What's his name? / What is his name?|g:shenme
很 高兴 认识 你 ！|Nice to meet you! / Pleased to meet you!
认识 你 很 高兴 。|Nice to meet you. / It's nice to meet you.
你 是 哪 国 人 ？|Where are you from? / What nationality are you? / Which country are you from?|g:na,g:shenme
我 是 美国 人 。|I'm American. / I am American.|g:na
他 是 中国 人 吗 ？|Is he Chinese?|g:na
你 会 说 中文 吗 ？|Can you speak Chinese? / Do you speak Chinese?|g:hui
我 会 说 一点 中文 。|I can speak a little Chinese. / I speak a little Chinese.|g:hui
我 不 会 说 英文 。|I can't speak English. / I don't speak English.|g:hui
她 会 说 英文 。|She can speak English. / She speaks English.|g:hui
他 是 我 朋友 。|He's my friend. / He is my friend.
你 朋友 叫 什么 名字 ？|What's your friend's name? / What is your friend's name?|g:shenme
我们 是 朋友 。|We're friends. / We are friends.

# 3
请 再 说 一 遍 。|Please say it again. / Please say that again. / Could you say that again?|g:qing
请 说 慢 一点 。|Please speak more slowly. / Please speak a little slower. / Please speak slower.|g:qing,g:yidian
我 听 不 懂 。|I don't understand. / I can't understand.|g:tingbudong
我 懂 。|I understand.
我 不 懂 。|I don't understand.
什么 意思 ？|What does it mean? / What does that mean? / What do you mean?|g:yisi
你好 是 什么 意思 ？|What does 你好 mean? / What does nihao mean?|g:yisi
Hello 用 中文 怎么 说 ？|How do you say "hello" in Chinese? / How do you say hello in Chinese?|g:zenmeshuo
请 用 中文 说 。|Please say it in Chinese. / Please speak Chinese.|g:qing
我 不 知道 。|I don't know.
你 知道 吗 ？|Do you know?
我 可以 问 一下 吗 ？|Can I ask (something)? / May I ask? / Can I ask?|g:keyi,g:yixia
对 ！|Right! / Correct! / Yes!
对 吗 ？|Is that right? / Right? / Is that correct?|g:ma
请 等 一下 。|Please wait a moment. / Wait a moment, please. / Just a moment, please.|g:qing,g:yixia
请 再 听 一 遍 。|Please listen again. / Listen one more time, please.|g:qing

# 4
一 、 二 、 三 、 四 、 五 。|One, two, three, four, five.|g:numbers
六 、 七 、 八 、 九 、 十 。|Six, seven, eight, nine, ten.|g:numbers
九 十 九 。|Ninety-nine. / 99.|g:numbers
今年 是 二 零 二 六 年 。|This year is 2026. / It's 2026 this year.|g:numbers
你 今年 多 大 ？|How old are you? / How old are you this year?|g:age
我 今年 二 十 五 岁 。|I'm 25 this year. / I'm twenty-five. / I am 25 years old.|g:age,g:numbers
他 十 岁 。|He's ten. / He is ten years old. / He's ten years old.|g:age
你 几 岁 ？|How old are you? (to a child)|g:age,g:jiduoshao
两 个 人 。|Two people. / Two of us. / A table for two.|g:liang,g:measure
三 个 老师 ， 两 个 学生 。|Three teachers, two students.|g:measure,g:liang
几 个 人 ？|How many people?|g:jiduoshao
多少 人 ？|How many people?|g:jiduoshao

# 5
你 喜欢 什么 ？|What do you like?|g:xihuan
我 喜欢 打 游戏 。|I like playing games. / I like gaming. / I like playing video games.|g:xihuan
你 喜欢 玩 什么 游戏 ？|What games do you like to play? / What games do you like playing?|g:xihuan
我 喜欢 看 电影 ， 也 喜欢 听 音乐 。|I like watching movies, and I also like listening to music. / I like movies and I also like music.|g:xihuan,g:ye
他 非常 喜欢 跑步 。|He really likes running. / He loves running. / He likes running very much.
我们 都 喜欢 爬山 。|We all like hiking. / We both like hiking. / We all like climbing mountains.|g:dou
你 有 什么 爱好 ？|What hobbies do you have? / What are your hobbies?|g:you
我 爱 唱歌 。|I love singing. / I love to sing.
她 不 喜欢 运动 。|She doesn't like sports. / She doesn't like exercising. / She doesn't like exercise.
我 喜欢 看 书 。|I like reading. / I like reading books. / I like to read.|g:xihuan
他 有 电脑 。|He has a computer.|g:you
你 用 手机 玩 游戏 吗 ？|Do you play games on your phone?
太 好 了 ！|Great! / That's great! / Awesome!|g:taile
太 有 意思 了 ！|That's so interesting! / How interesting! / Really interesting!|g:taile,g:you
你们 都 是 学生 吗 ？|Are you all students?|g:dou

# 6
我 没有 女朋友 。|I don't have a girlfriend.|g:meiyou
你 有 男朋友 吗 ？|Do you have a boyfriend?|g:you
你 有 没有 哥哥 ？|Do you have an older brother?|g:anota
我 有 一 个 姐姐 和 两 个 弟弟 。|I have an older sister and two younger brothers.|g:he,g:measure
你 家 有 几 口 人 ？|How many people are in your family? / How many people are there in your family?|g:jiduoshao
我 家 有 四 口 人 。|There are four people in my family. / My family has four people.
她 是 我 妈妈 。|She's my mom. / She is my mother. / She's my mother.|g:de
我 爸爸 是 老师 。|My dad is a teacher. / My father is a teacher.|g:de
我 有 一 只 狗 。|I have a dog.|g:measure
我 的 狗 很 小 。|My dog is small. / My dog is very small.|g:de
你 喜欢 猫 吗 ？|Do you like cats?
他 是 不 是 你 男朋友 ？|Is he your boyfriend? / Is he your boyfriend or not?|g:anota
你 喜欢 不 喜欢 打 游戏 ？|Do you like gaming? / Do you like playing games or not?|g:anota
没 问题 ！|No problem!
我 妹妹 没有 手机 。|My younger sister doesn't have a phone. / My little sister doesn't have a phone.|g:meiyou
大家 好 ！|Hello everyone! / Hi everyone! / Hi all!
我 哥哥 的 朋友 是 中国 人 。|My older brother's friend is Chinese.|g:de

# 7
你 饿 吗 ？|Are you hungry?
我 很 饿 。|I'm hungry. / I am very hungry. / I'm very hungry.
你 想 吃 什么 ？|What would you like to eat? / What do you want to eat?|g:yaoxiang
我 想 吃 饺子 。|I'd like to eat dumplings. / I want to eat dumplings. / I'd like dumplings.|g:yaoxiang
服务员 ！|Waiter! / Excuse me!
我 要 一 碗 面 。|I'd like a bowl of noodles. / I want a bowl of noodles. / A bowl of noodles, please.|g:yaoxiang,g:measure
我 要 两 杯 咖啡 。|Two coffees, please. / I want two cups of coffee. / I'd like two coffees.|g:yaoxiang,g:liang
你 喝 什么 ？|What would you like to drink? / What are you drinking? / What will you drink?|g:vo
我 喝 茶 ， 不 喝 啤酒 。|I'll have tea, not beer. / I drink tea, not beer.|g:vo
这个 菜 辣 不 辣 ？|Is this dish spicy?|g:zhe,g:anota
那个 很 好吃 。|That one is delicious. / That one's really good.|g:zhe
这 是 什么 ？|What is this? / What's this?|g:zhe
你 吃 饭 了 吗 ？|Have you eaten? / Have you eaten yet?|g:vo
我 要 米饭 。|I'll have rice. / I want rice. / Rice, please.|g:yaoxiang
我 要 一 杯 水 。|A glass of water, please. / I'd like a glass of water. / I want a glass of water.|g:yaoxiang,g:measure
买单 ！|The check, please! / Check, please! / Can I get the bill?
饺子 非常 好吃 ！|The dumplings are really delicious! / The dumplings are delicious!
那 是 你 的 咖啡 吗 ？|Is that your coffee?|g:zhe,g:de

# 8
这个 多少 钱 ？|How much is this? / How much does this cost?|g:price
二 十 块 。|Twenty yuan. / 20 kuai. / Twenty kuai.|g:price
太 贵 了 ！|That's too expensive! / Too expensive!|g:taile
可以 便宜 一点 吗 ？|Can you make it cheaper? / Could it be a bit cheaper? / Can it be cheaper?|g:yidian,g:keyi
你 想 买 什么 ？|What do you want to buy? / What would you like to buy?
我 想 买 一 件 衣服 。|I want to buy some clothes. / I'd like to buy a piece of clothing.|g:measure
这 件 衣服 很 便宜 。|This piece of clothing is cheap. / This is cheap.|g:zhe
这个 商店 卖 什么 ？|What does this shop sell? / What does this store sell?|g:zhe
他们 卖 手机 吗 ？|Do they sell phones?
我 没有 钱 。|I don't have any money. / I have no money. / I don't have money.|g:meiyou
给 我 一 杯 茶 吧 。|Give me a cup of tea. / Let me have a cup of tea.|g:ba
我们 买 这个 吧 ！|Let's buy this one! / Let's buy this!|g:ba
我 能 用 手机 买 吗 ？|Can I pay with my phone? / Can I use my phone to buy it?|g:neng
你 买 什么 东西 ？|What are you buying? / What things are you buying?

# 9
今天 你 忙 吗 ？|Are you busy today?|g:time
我 今天 很 忙 。|I'm busy today. / I am very busy today.|g:time
现在 几 点 ？|What time is it? / What time is it now?|g:clock
现在 三 点 半 。|It's half past three. / It's 3:30. / It's three thirty.|g:clock
你 明天 有 时间 吗 ？|Do you have time tomorrow? / Are you free tomorrow?|g:time
我 晚上 有 时间 。|I have time in the evening. / I'm free in the evening.|g:time
你 什么 时候 有 时间 ？|When are you free? / When do you have time?|g:shenmeshihou
周末 我 喜欢 爬山 。|I like hiking on weekends. / On weekends I like to hike.|g:time
我 每 天 早上 跑步 。|I run every morning. / I go running every morning.|g:time
今天 星期 几 ？|What day is it today? / What day of the week is it today?|g:time
今天 星期 五 。|Today is Friday. / It's Friday today.|g:time
昨天 我 很 忙 。|I was busy yesterday. / Yesterday I was very busy.|g:time
明天 早上 八 点 。|Tomorrow at eight in the morning. / 8 o'clock tomorrow morning. / Tomorrow at 8 a.m.|g:clock

# 10
你 去 哪儿 ？|Where are you going?|g:qu,g:nar
我 去 学校 。|I'm going to school. / I am going to school.|g:qu
你 住 在 哪儿 ？|Where do you live?|g:zai,g:nar
我 住 在 北京 。|I live in Beijing.|g:zai
你 在 哪里 工作 ？|Where do you work?|g:zai,g:nar
我 在 上海 工作 。|I work in Shanghai.|g:zai
她 在 大学 学习 中文 。|She studies Chinese at university. / She's studying Chinese at university.|g:zai
你 是 哪里 人 ？|Where are you from?|g:nar
你 什么 时候 来 中国 ？|When are you coming to China? / When will you come to China?|g:qu,g:shenmeshihou
我 在 这儿 。|I'm here. / I am here.|g:zai
他 在 那儿 。|He's over there. / He is there. / He's there.|g:zai
我 现在 回 家 。|I'm going home now. / I'm heading home now.|g:qu
你 在 哪儿 ？|Where are you?|g:zai,g:nar
我 在 公司 。|I'm at the office. / I'm at work. / I'm at the company.|g:zai

# 11
你 昨天 做 什么 了 ？|What did you do yesterday?|g:le
我 昨天 看 了 一 个 电影 。|I watched a movie yesterday. / Yesterday I watched a movie.|g:le
我 已经 吃 了 。|I've already eaten. / I already ate.|g:le
我 还 没 吃 饭 。|I haven't eaten yet.|g:meipast
他 昨天 没 去 学校 。|He didn't go to school yesterday.|g:meipast
你 周末 打算 做 什么 ？|What are you planning to do this weekend? / What are your plans for the weekend?
我 打算 去 上海 。|I'm planning to go to Shanghai. / I plan to go to Shanghai.
我们 一起 去 吧 ！|Let's go together!|g:yiqiba
我们 明天 见面 吧 。|Let's meet tomorrow. / Let's meet up tomorrow.|g:yiqiba
明天 见 ！|See you tomorrow!
你 觉得 怎么样 ？|What do you think? / How do you feel about it?|g:zenmeyang,g:juede
我 觉得 很 好 。|I think it's good. / I think it's great.|g:juede
明天 晚上 怎么样 ？|How about tomorrow evening? / How about tomorrow night?|g:zenmeyang
他 可能 不 来 。|He might not come. / Maybe he won't come.
你 每 天 几 点 起床 ？|What time do you get up every day? / What time do you get up?|g:clock
我 晚上 十 一 点 睡觉 。|I go to bed at eleven at night. / I sleep at 11 p.m.|g:clock,g:time
他 还 在 睡觉 。|He's still sleeping. / He is still asleep.
我 做 了 饺子 。|I made dumplings.|g:le

# 12
洗手间 在 哪儿 ？|Where's the restroom? / Where is the bathroom? / Where is the toilet?|g:nar
往 左 走 。|Go left. / Turn left. / Walk to the left.|g:wang
往 右 走 。|Go right. / Turn right. / Walk to the right.|g:wang
洗手间 在 右边 。|The restroom is on the right. / The bathroom is on the right.|g:zai
酒店 在 左边 。|The hotel is on the left.|g:zai
机场 远 吗 ？|Is the airport far?
酒店 很 近 。|The hotel is close. / The hotel is nearby. / The hotel is very close.
我 坐 地铁 去 机场 。|I take the subway to the airport. / I'm taking the subway to the airport.|g:zuo
我们 坐 出租车 吧 。|Let's take a taxi.|g:zuo,g:ba
你 怎么 去 上海 ？|How are you getting to Shanghai? / How will you go to Shanghai?|g:zuo
我 坐 火车 去 。|I'm taking the train. / I'll go by train. / I'm going by train.|g:zuo
从 北京 到 上海 多少 钱 ？|How much is it from Beijing to Shanghai?|g:congdao,g:price
从 这儿 到 机场 远 不 远 ？|Is it far from here to the airport?|g:congdao,g:anota
你 喜欢 旅行 吗 ？|Do you like traveling? / Do you like to travel?
请 帮 我 一下 。|Please help me. / Could you help me? / Please give me a hand.|g:qing,g:yixia
我 到 酒店 了 。|I've arrived at the hotel. / I'm at the hotel now.|g:le
飞机 几 点 到 ？|What time does the plane arrive? / When does the flight land?|g:clock
去 机场 怎么 走 ？|How do I get to the airport? / Which way to the airport?|g:zenmezou
`;

// id | title | pattern | explanation | why (the "Why?" button)
export const GRAMMAR = `
# 1
g:shi|是 links two nouns|A 是 B|是 links nouns: 我是学生 "I am a student". Don't use it before adjectives (see 很).|Mandarin verbs never change for person or tense, so 是 covers am, is, are, was and were.
g:ma|Yes/no questions with 吗|statement + 吗？|Add 吗 to the end of a statement to make a yes/no question. The word order doesn't change.|Mandarin often marks questions with a final particle instead of reordering words like English does.
g:hen|Adjectives with 很|subject + 很 + adjective|Adjectives work like verbs: 我很好 "I am well", with no 是. 很 often doesn't mean "very" here.|Without 很, 我好 sounds like a comparison ("I'm the good one"); 很 makes it a neutral statement.
g:bu|Negation with 不|不 + verb / adjective|Put 不 right before the verb or adjective: 不是, 不好.|不 negates habits, states and the future; 没 (unit 6) negates having and things that happened. 不 is said bú before a 4th tone.
g:ne|Bounce it back with 呢|topic + 呢？|你呢？ "And you?" asks the same question about someone else.|呢 saves repeating the whole question: the fastest way to keep a conversation going.
g:ye|也 = also|subject + 也 + verb|也 goes right after the subject, before the verb: 我也是学生. Never at the end.|Adverbs like 也, 很, 都 and 不 always sit before the verb in Mandarin.

# 2
g:jiao|Saying your name|我叫 + name|叫 means "to be called": 我叫小明.|我的名字是… is correct but stiff; 叫 is what people actually say.
g:shenme|Question words stay in place|你叫什么名字？|Put the question word where the answer will go: 我叫小明 → 你叫什么名字？|Unlike English, Mandarin never moves question words to the front, so answering is just swapping one word.
g:na|Nationality|country + 人|中国人 = Chinese person, 美国人 = American. Ask 你是哪国人？|哪 = which, so 哪国人 is literally "which-country person".
g:hui|Can (a learned skill) with 会|会 + verb|会 = can because you learned how: 我会说中文. Negative: 不会.|Mandarin has three "can"s: 会 (learned skill), 能 (able, unit 8) and 可以 (allowed, unit 3).

# 3
g:qing|Polite requests with 请|请 + verb|Start a request with 请: 请等一下.|请 literally means "to invite", so it always comes first, before the verb.
g:tingbudong|Can't understand (by listening)|听不懂 / 听得懂|听 (listen) + 懂 (understand); 不 in the middle means you can't.|Mandarin builds "can't manage to" by putting 不 between a verb and its result. 听不懂 is a beginner's most useful sentence.
g:yisi|What does it mean?|X 是什么意思？|Put the word you don't know first, then 是什么意思？|It lets you learn new words from native speakers without switching to English.
g:zenmeshuo|How do you say…?|X 用中文怎么说？|Literally "X, using Chinese, how say?"|The single most powerful question for growing your vocabulary mid-conversation.
g:yidian|A bit more…|adjective + 一点|慢一点 = a bit slower; 便宜一点 = a bit cheaper.|After an adjective, 一点 means "a bit more so than now", which makes requests softer.
g:yixia|Doing something briefly|verb + 一下|等一下 = wait a moment; 问一下 = ask quickly.|一下 makes an action short and casual, which sounds more polite.
g:keyi|Asking permission with 可以|可以 + verb (+ 吗)|我可以问一下吗？ = May I ask?|可以 is about permission; 会 (unit 2) is about a learned skill.

# 4
g:numbers|Numbers to 99|十 + digit / digit + 十|十一 = 11, 二十 = 20, 二十五 = 25. Years are read digit by digit: 二零二六年.|Mandarin numbers are completely regular: knowing 1–10 gives you 1–99.
g:age|Saying your age|我今年 + number + 岁|No 是: 我二十五岁. Ask adults 你多大？ and children 你几岁？|Ages, dates and prices take no verb in Mandarin.
g:measure|Measure words|number + measure word + noun|You can't say 三学生; you need a measure word: 三个学生. 个 is the general one.|Like "three cups of coffee", except Mandarin needs one for every counted noun.
g:liang|两 vs 二|两 + measure word|Use 两 for "two of something" (两个人) and 二 when counting or in numbers (二十).|二个 is a classic beginner mistake that natives notice immediately.
g:jiduoshao|How many: 几 or 多少|几 + measure word / 多少 + noun|几 expects a small number (under about 10) and needs a measure word; 多少 works for any amount.|Picking one signals what size of answer you expect.

# 5
g:xihuan|Likes: 喜欢 + verb|喜欢 + verb phrase / noun|我喜欢打游戏 = I like playing games. No "-ing" needed.|Mandarin verbs never change form, so 喜欢 + any verb phrase just works.
g:dou|都 = all / both|plural subject + 都 + verb|都 points back at the subject and comes before the verb: 我们都喜欢爬山.|都 always refers to something already mentioned, never to what follows.
g:taile|太…了!|太 + adjective + 了|太好了！ = Great! Adds strong feeling, or "too (much)".|了 here marks emphasis or a new situation, not the past.
g:you|有 = have / there is|subject + 有 + noun|他有电脑 = He has a computer. 有意思 = interesting ("has meaning").|One verb covers "have" and "there is"; its negative is always 没有 (unit 6), never 不有.

# 6
g:meiyou|Not having: 没有|没有 + noun|The negative of 有 is always 没有, never 不有.|没 negates having and things that happened; 不 negates habits and states.
g:anota|Yes/no with A-not-A|verb + 不 + verb|是不是, 有没有, 喜欢不喜欢: a yes/no question without 吗.|Sounds natural for genuine either/or questions; the middle 不 is said lightly.
g:de|Possession with 的|owner + 的 + thing|我的狗 = my dog. Leave out 的 for family and close relationships: 我妈妈, 我男朋友.|Dropping 的 with people close to you is what natives do; keeping it sounds formal.
g:he|和 = and (for nouns)|noun + 和 + noun|一个姐姐和两个弟弟. 和 only joins nouns, never two sentences.|English "and" joins anything; 和 doesn't, so "I eat and he drinks" has no 和.

# 7
g:yaoxiang|Wanting: 要 and 想|要 / 想 + noun or verb|想 = would like (softer); 要 = want / will have (direct, and normal when ordering).|Ordering with 要 isn't rude in Mandarin; it's the usual way to say "I'll have…".
g:zhe|This and that|这 / 那 (+ measure word) + noun|这个菜 = this dish; 那个 = that one; 这是什么？ = What's this?|When a noun follows, 这 and 那 need a measure word, just like numbers do.
g:vo|Verb + object pairs|吃饭, 喝水, 唱歌, 跑步|Many everyday verbs come with a built-in generic object: 吃饭 is "to eat (a meal)".|Learning these as chunks keeps "I eat" from sounding unfinished.

# 8
g:price|Prices|thing + 多少钱？ / number + 块|这个多少钱？ 二十块。 No verb needed.|块 is the everyday word for yuan; price tags say 元.
g:ba|Suggestions with 吧|sentence + 吧|我们买这个吧！ = Let's buy this! It softens orders into suggestions.|吧 makes requests and suggestions sound friendly instead of blunt.
g:neng|Can (able or possible) with 能|能 + verb|能 = can because circumstances allow: 我能用手机买吗？|会 = learned skill, 能 = ability or possibility, 可以 = permission. They overlap, but these defaults are always safe.

# 9
g:time|Time words come early|(time) + subject + (time) + verb|我明天有时间 or 明天我有时间, never at the end like English.|Mandarin sets the scene first (when, then where), then says what happens.
g:clock|Telling the time|number + 点 (+ 半)|三点 = 3:00, 三点半 = 3:30. 几点？ = What time?|Same pattern as ages and prices: number + unit, no verb.
g:shenmeshihou|When?|什么时候 + verb|你什么时候有时间？ The question sits where the time would go.|Same "question words stay in place" rule as 什么 and 哪.

# 10
g:zai|Where things happen: 在|在 + place + verb|我在上海工作. The place comes before the verb. On its own, 在 means "to be at": 我在公司.|English puts "in Shanghai" last; Mandarin puts it before the action.
g:qu|Going somewhere: 去, 来, 回|去 / 来 / 回 + place|去 = go, 来 = come, 回 = go back. No "to" needed: 我去学校.|The destination is the verb's direct object.
g:nar|Where: 哪儿 or 哪里|在哪儿？|哪儿 (northern) and 哪里 mean the same; both are understood everywhere.|Like 什么, the question word stays where the answer goes.

# 11
g:le|Completed actions with 了|verb + 了 (+ object) / sentence + 了|我看了一个电影 = I watched a movie. 了 marks completion, not past tense.|Mandarin has no tenses: time words (昨天) say when, 了 says it got done. Don't put 了 on habits or states.
g:meipast|Didn't / haven't: 没 + verb|没 + verb (no 了)|我昨天没去 = I didn't go. 还没 = not yet. Drop 了 when negating.|不去 = won't or don't go (choice, habit); 没去 = didn't go (fact). Mixing them up changes the meaning.
g:yiqiba|Let's… together|我们一起 + verb + 吧|我们一起去吧！ = Let's go together!|The friendliest way to make plans; 吧 keeps it a suggestion.
g:zenmeyang|How about…? / How is…?|X 怎么样？|明天晚上怎么样？ proposes; 你觉得怎么样？ asks for an opinion.|One phrase for both suggesting and asking opinions.
g:juede|Opinions with 觉得|我觉得 + statement|我觉得很好 = I think it's good.|觉得 is for opinions and feelings; 想 (unit 7) is for wanting and planning.

# 12
g:zuo|Taking transport: 坐|坐 + vehicle + 去 + place|我坐地铁去机场. Ask how: 你怎么去？|坐 literally means "sit": you sit on the vehicle. The order is how → go → where.
g:congdao|From… to…|从 A 到 B|从北京到上海 = from Beijing to Shanghai.|从…到… works for places and times alike (从三点到五点).
g:wang|Directions with 往|往 + direction + 走|往左走 = go left.|往 means "toward"; with 走 it gives every basic direction.
g:zenmezou|How do I get to…?|去 + place + 怎么走？|去机场怎么走？|The standard way to ask for directions.
`;

// n | title | Chinese title | goal ("after this unit you can…") | milestone
export const UNITS = `
1|Hello!|你好！|Greet people, say thanks, sorry and goodbye, and ask simple yes/no questions.
2|What's your name?|你叫什么名字？|Introduce yourself: your name, where you're from, and what languages you speak.
3|I don't understand|我听不懂|Keep a conversation alive: ask people to repeat, slow down, explain a word, or tell you how to say something.
4|Numbers & age|数字和年龄|Count to 99, say your age, and ask how many.
5|What do you like?|你喜欢什么？|Talk about hobbies: games, movies, music and sports.
6|Family & friends|家人和朋友|Talk about your family, pets and relationships, and ask either/or questions.
7|Eating out|吃饭|Order food and drinks, and ask what something is.
8|Shopping|买东西|Ask prices, bargain, and suggest things.
9|Time|时间|Say when things happen, tell the time, and say when you're free.
10|Places|地方|Say where you live, work and study, and where you're going.
11|Plans & yesterday|计划|Say what you did and haven't done yet, and make plans with someone.|First 5-minute conversation (M1)
12|Getting around|出行|Travel by subway, taxi, train or plane, and ask for directions.
`;

// character | pinyin | meaning | components | memory hook
// Characters that recur across several words, or whose parts genuinely help memory.
export const CHARACTERS = `
好|hao3|good|女 woman + 子 child|A woman with her child: good.
你|ni3|you|亻 person + 尔|
他|ta1|he|亻 person + 也|
她|ta1|she|女 woman + 也|Same sound as 他, with 女 for female.
们|men0|plural marker for people|亻 person + 门 door (sound: mén)|Sounds like 门; the person radical says it's about people.
妈|ma1|mom|女 woman + 马 horse (sound: mǎ)|
吗|ma0|question particle|口 mouth + 马 (sound: mǎ)|Spoken particles often have the 口 mouth radical.
呢|ne0|particle|口 mouth + 尼 (sound: ní)|
吃|chi1|eat|口 mouth + 乞|
喝|he1|drink|口 mouth + 曷 (sound: hé)|
叫|jiao4|call; be called|口 mouth + 丩|Calling out with your mouth.
唱|chang4|sing|口 mouth + 昌 (sound: chāng)|
明|ming2|bright; next (day)|日 sun + 月 moon|Sun and moon together: bright.
时|shi2|time|日 sun + 寸|The sun tracks the time.
星|xing1|star|日 + 生 (sound: shēng)|
早|zao3|early|日 sun + 十|The sun just over the horizon.
晚|wan3|late; evening|日 sun + 免 (sound: miǎn)|
想|xiang3|think; want|相 + 心 heart|
意|yi4|idea; meaning|音 sound + 心 heart|The sound of the heart: an idea.
思|si1|think|田 field + 心 heart|
爱|ai4|love|爫 + 冖 + 友 friend|Simplified 爱 has 友 (friend) at its heart.
家|jia1|home; family|宀 roof + 豕 pig|A pig under a roof: a household.
字|zi4|character; word|宀 roof + 子 child|A child under a roof, learning characters.
学|xue2|study|⺍ + 冖 + 子 child|A child under a roof, learning.
男|nan2|male|田 field + 力 strength|Strength in the fields.
国|guo2|country|囗 border + 玉 jade|Treasure inside the borders.
回|hui2|return|口 inside 囗|Going round and back again.
问|wen4|ask|门 door + 口 mouth|A mouth at the door, asking.
听|ting1|listen|口 mouth + 斤|
说|shuo1|speak|讠 speech + 兑|讠 marks words about speaking.
请|qing3|please; invite|讠 speech + 青 (sound: qīng)|
谢|xie4|thank|讠 speech + 射 (sound: shè)|
认|ren4|recognise|讠 speech + 人 (sound: rén)|
识|shi2|know|讠 speech + 只 (sound: zhī)|
饭|fan4|meal; rice|饣 food + 反 (sound: fǎn)|饣 marks things about food.
饺|jiao3|dumpling|饣 food + 交 (sound: jiāo)|
饿|e4|hungry|饣 food + 我 me|Food for me: I'm hungry.
钱|qian2|money|钅 metal + 戋|Coins are metal.
茶|cha2|tea|艹 plant + 人 person + 木 tree|A person among plants and trees.
菜|cai4|dish; vegetable|艹 plant + 采 pick|Picked plants.
机|ji1|machine|木 wood + 几 (sound: jǐ)|In 手机, 飞机 and 机场.
校|xiao4|school|木 wood + 交|
坐|zuo4|sit|人 + 人 on 土 ground|Two people sitting on the ground.
远|yuan3|far|辶 walk + 元 (sound: yuán)|辶 marks movement and distance.
近|jin4|near|辶 walk + 斤 (sound: jīn)|
这|zhe4|this|辶 walk + 文|
道|dao4|way; road|辶 walk + 首 head|Walking where your head leads: the way.
酒|jiu3|alcohol|氵 water + 酉 jar|Liquid from a jar.
海|hai3|sea|氵 water + 每 (sound: měi)|
洗|xi3|wash|氵 water + 先 (sound: xiān)|
没|mei2|not have|氵 water + 殳|
人|ren2|person||A person walking.
大|da4|big|一 + 人 person|A person stretching their arms wide.
天|tian1|day; sky|一 + 大|What's above the big person: the sky.
中|zhong1|middle|口 + 丨|A line through the middle.
文|wen2|writing; language||In 中文 and 英文.
生|sheng1|life; born||In 学生 and 先生.
电|dian4|electric||Lightning. In 电影 and 电脑.
车|che1|vehicle||A cart seen from above. In 出租车 and 火车.
手|shou3|hand||In 手机 and 洗手间.
今|jin1|now; current||In 今天 and 今年.
年|nian2|year||
朋|peng2|friend|月 + 月|Two moons side by side: companions.
友|you3|friend||
工|gong1|work||
动|dong4|move|云 + 力 strength|
点|dian3|dot; o'clock|占 + 灬|
爸|ba4|dad|父 father + 巴 (sound: bā)|
哥|ge1|older brother|可 + 可|
姐|jie3|older sister|女 woman + 且 (sound: qiě)|
妹|mei4|younger sister|女 woman + 未 (sound: wèi)|
`;

// syllable | 1st | 2nd | 3rd | 4th — one character per tone, for hearing the four tones on one syllable.
export const TONE_SETS = `
ma|妈|麻|马|骂
yi|衣|姨|椅|意
ba|八|拔|把|爸
shi|诗|十|使|是
tang|汤|糖|躺|烫
wen|温|文|稳|问
qi|七|骑|起|气
tu|秃|图|土|兔
fan|翻|烦|反|饭
`;

// id | what is contrasted | char pinyin | char pinyin | how to make each sound — pairs English speakers commonly merge.
export const SOUND_PAIRS = `
zh-j|zh vs j|知 zhi1|鸡 ji1|zh: tongue tip curled back to the roof of the mouth. j: tongue flat, tip behind the lower teeth, lips spread.
ch-q|ch vs q|吃 chi1|七 qi1|ch: curled back like zh, with a puff of air. q: like j, with a puff of air and lips spread.
sh-x|sh vs x|师 shi1|西 xi1|sh: tongue curled back, deeper than English "sh". x: tongue flat and lips spread, a soft "sy".
z-zh|z vs zh|资 zi1|知 zhi1|z: like "ds" in "kids", tongue behind the teeth. zh: tongue curled back.
c-ch|c vs ch|擦 ca1|插 cha1|c: like "ts" in "cats", with a puff of air. ch: tongue curled back, with a puff of air.
s-sh|s vs sh|四 si4|是 shi4|s: tongue tip behind the teeth. sh: tongue curled back.
b-p|b vs p (puff of air)|宝 bao3|跑 pao3|b: no puff of air, like the p in "spin". p: a strong puff, like the p in "pin".
d-t|d vs t (puff of air)|搭 da1|他 ta1|d: no puff of air, like the t in "stop". t: a strong puff, like the t in "top".
g-k|g vs k (puff of air)|哥 ge1|科 ke1|g: no puff of air, like the k in "skin". k: a strong puff, like the k in "kin".
u-ü|u vs ü|路 lu4|绿 lü4|u: lips rounded, tongue back. ü: say "ee", then round your lips without moving your tongue.
n-ng|-n vs -ng|金 jin1|京 jing1|-n: tongue tip touches behind the top teeth. -ng: back of the tongue rises, like "sing".
an-ang|an vs ang|山 shan1|商 shang1|an: front of the mouth, tongue tip up. ang: back of the mouth, like "ahng".
r-l|r vs l|热 re4|乐 le4|r: tongue curled back, close to the s in "pleasure". l: tongue tip on the ridge behind the teeth.
`;

// Listening dialogues. `@ id|unit|title` starts one; `A|zh|en` / `B|zh|en` are lines (tokenised like
// SENTENCES); `?|question|right answer|wrong|wrong` asks about it (options are shuffled when shown).
export const DIALOGUES = `
@ hello|1|Saying hello
A|你好 ！|Hello!
B|你好 ！ 你 好 吗 ？|Hi! How are you?
A|我 很 好 ， 谢谢 。 你 呢 ？|I'm fine, thanks. And you?
B|我 也 很 好 。|I'm fine too.
A|你 是 学生 吗 ？|Are you a student?
B|不 是 ， 我 是 老师 。|No, I'm a teacher.
?|How is the second speaker?|Fine too|Not very well|Busy
?|What does the second speaker do?|Teacher|Student|We don't know

@ names|2|Meeting someone
A|你好 ！ 你 叫 什么 名字 ？|Hi! What's your name?
B|我 叫 小明 。 你 呢 ？|I'm Xiaoming. And you?
A|我 叫 李华 。 很 高兴 认识 你 ！|I'm Li Hua. Nice to meet you!
B|认识 你 很 高兴 。 你 是 哪 国 人 ？|Nice to meet you. Where are you from?
A|我 是 中国 人 。 你 呢 ？|I'm Chinese. And you?
B|我 是 美国 人 。|I'm American.
?|Where is Xiaoming from?|America|China|We don't know
?|What is the first speaker's name?|Li Hua|Xiaoming|They don't say

@ repair|3|Can you say that again?
A|你 会 说 中文 吗 ？|Can you speak Chinese?
B|会 一点 。 请 说 慢 一点 。|A little. Please speak more slowly.
A|好 。 你 叫 什么 名字 ？|OK. What's your name?
B|对不起 ， 我 听 不 懂 。 请 再 说 一 遍 。|Sorry, I don't understand. Please say it again.
A|你 叫 什么 名字 ？|What's your name?
B|我 叫 小明 。|I'm Xiaoming.
?|What does the second speaker ask for first?|Speak more slowly|Speak English|Write it down
?|Did the second speaker understand the question the first time?|No|Yes|They don't say

@ hobbies|5|What do you like?
A|你 喜欢 什么 ？|What do you like?
B|我 喜欢 打 游戏 。 你 呢 ？|I like gaming. And you?
A|我 不 喜欢 打 游戏 。 我 喜欢 爬山 。|I don't like gaming. I like hiking.
B|爬山 ？ 太 有 意思 了 ！|Hiking? How interesting!
?|What does the first speaker like?|Hiking|Gaming|Music
?|What does the second speaker like?|Gaming|Hiking|Movies

@ family|6|Family and pets
A|你 家 有 几 口 人 ？|How many people are in your family?
B|四 口 人 ： 爸爸 、 妈妈 、 姐姐 和 我 。|Four: dad, mom, my older sister and me.
A|你 有 没有 狗 ？|Do you have a dog?
B|没有 ， 我 有 一 只 猫 。|No, I have a cat.
?|How many people are in the second speaker's family?|Four|Three|Five
?|What pet does the second speaker have?|A cat|A dog|No pets

@ ordering|7|At a restaurant
A|你好 ！ 你 想 吃 什么 ？|Hello! What would you like to eat?
B|我 要 一 碗 面 。|I'll have a bowl of noodles.
A|喝 什么 ？|And to drink?
B|我 要 一 杯 茶 。 这个 菜 辣 不 辣 ？|A cup of tea. Is this dish spicy?
A|不 辣 。 非常 好吃 ！|It's not spicy. It's really good!
?|What does the customer order to eat?|A bowl of noodles|Dumplings|Rice
?|What does the customer drink?|Tea|Coffee|Beer

@ living|10|Where do you live?
A|你 住 在 哪儿 ？|Where do you live?
B|我 住 在 上海 。 你 呢 ？|I live in Shanghai. And you?
A|我 住 在 北京 ， 我 在 大学 工作 。|I live in Beijing, and I work at a university.
B|你 是 老师 吗 ？|Are you a teacher?
A|对 ， 我 是 老师 。|Yes, I'm a teacher.
?|Where does the second speaker live?|Shanghai|Beijing|They don't say
?|What does the first speaker do?|Teaches at a university|Studies at a university|Works at a company

@ weekend|11|Weekend plans
A|你 周末 打算 做 什么 ？|What are you planning to do this weekend?
B|我 打算 去 爬山 。 你 呢 ？|I'm planning to go hiking. And you?
A|我 还 不 知道 。|I don't know yet.
B|我们 一起 去 吧 ！|Let's go together!
A|好 ！ 几 点 ？|OK! What time?
B|早上 八 点 怎么样 ？|How about eight in the morning?
A|九 点 吧 。|Let's say nine.
?|What will they do at the weekend?|Go hiking together|Watch a movie|Stay at home
?|What time does the first speaker want to meet?|Nine o'clock|Eight o'clock|Ten o'clock

@ directions|12|Finding the restroom
A|对不起 ， 洗手间 在 哪儿 ？|Excuse me, where's the restroom?
B|往 左 走 ， 洗手间 在 左边 。|Go left; the restroom is on the left.
A|远 吗 ？|Is it far?
B|不 远 ， 很 近 。|No, it's very close.
A|谢谢 ！|Thanks!
B|不客气 。|You're welcome.
?|Where is the restroom?|On the left|On the right|Upstairs
?|Is it far?|No, it's close|Yes, quite far|They don't say
`;

// Graded stories, built only from lexicon words; unit = the latest unit any of their words is from.
// `@ id|unit|title|Chinese title|topics`, then `zh|en` sentences; `¶` starts a paragraph;
// `?|question|right answer|wrong|wrong`.
export const STORIES = `
@ hello|1|Hello!|你好 ！|people
你好 ！ 我 是 学生 。|Hello! I'm a student.
他 也 是 学生 ， 她 是 老师 。|He's a student too, and she's a teacher.
我们 很 好 ， 老师 也 很 好 。|We're fine, and so is the teacher.
你 呢 ？ 你 是 学生 吗 ？|And you? Are you a student?
?|Who is the teacher?|She is|He is|The narrator
?|Is he a student?|Yes|No|They don't say

@ meet|2|Nice to meet you|认识 你 很 高兴|people
我 叫 小明 。|My name is Xiaoming.
我 是 中国 人 ， 我 是 学生 。|I'm Chinese, and I'm a student.
我 会 说 中文 ， 也 会 说 一点 英文 。|I speak Chinese, and a little English too.
¶
李华 是 我 朋友 。|Li Hua is my friend.
她 也 是 中国 人 。|She's Chinese too.
她 不 是 学生 ， 她 是 老师 。|She isn't a student; she's a teacher.
她 会 说 英文 。|She speaks English.
¶
你 呢 ？ 你 叫 什么 名字 ？ 你 是 哪 国 人 ？|And you? What's your name? Where are you from?
?|What does Li Hua do?|She's a teacher|She's a student|They don't say
?|Which languages does Xiaoming speak?|Chinese and a little English|Only Chinese|English and a little Chinese

@ again|3|Say it again, please|请 再 说 一 遍|people
小明 是 我 朋友 ， 他 是 中国 人 。|Xiaoming is my friend. He's Chinese.
他 说 中文 ， 我 听 不 懂 。|He speaks Chinese, and I don't understand.
我 说 ： 对不起 ， 请 说 慢 一点 。|I say: Sorry, please speak a little more slowly.
他 说 ： 好 ， 没关系 。|He says: OK, no problem.
¶
我 问 他 ： 认识 是 什么 意思 ？|I ask him: What does 认识 mean?
他 说 ： 请 等 一下 。|He says: Just a moment.
他 用 英文 说 。 我 说 ： 谢谢 你 ！|He says it in English. I say: Thank you!
他 说 ： 不客气 。 你 可以 再 问 我 。|He says: You're welcome. Ask me again any time.
?|Why does the narrator say sorry?|They don't understand Xiaoming|They are late|They forgot his name
?|How does Xiaoming explain 认识?|He says it in English|He writes it down|He says it more slowly

@ hobbies|5|What are your hobbies?|你 有 什么 爱好 ？|hobbies,gaming,outdoors
我 叫 小明 ， 今年 二 十 岁 。|I'm Xiaoming, and I'm twenty this year.
我 有 很 多 爱好 。|I have lots of hobbies.
我 喜欢 玩 游戏 ， 也 喜欢 看 电影 。|I like playing games, and I like watching movies too.
我 不 太 喜欢 运动 。|I don't really like sports.
¶
我 朋友 李华 非常 喜欢 运动 。|My friend Li Hua loves sports.
她 喜欢 跑步 ， 也 喜欢 爬山 。|She likes running, and hiking too.
她 不 玩 游戏 。|She doesn't play games.
¶
我们 都 喜欢 音乐 ， 也 都 爱 唱歌 ！|We both like music, and we both love singing!
?|How old is Xiaoming?|20|12|They don't say
?|What does Li Hua like?|Running and hiking|Games and movies|Only singing
?|What do they both like?|Music and singing|Sports|Movies

@ family|6|My family|我 家|family
我 家 有 五 口 人 ： 爸爸 、 妈妈 、 姐姐 、 弟弟 和 我 。|There are five people in my family: Dad, Mom, my older sister, my younger brother and me.
我 爸爸 是 老师 ， 我 妈妈 也 是 老师 。|My dad is a teacher, and my mom is a teacher too.
我 姐姐 二 十 五 岁 ， 她 有 男朋友 。|My sister is twenty-five, and she has a boyfriend.
我 弟弟 十 岁 ， 他 是 学生 。|My little brother is ten; he's a student.
¶
我们 家 有 一 只 狗 和 两 只 猫 。|We have a dog and two cats.
狗 很 大 ， 猫 都 很 小 。|The dog is big; the cats are both small.
我 弟弟 非常 喜欢 狗 。|My little brother loves the dog.
我 喜欢 猫 。|I like the cats.
?|How many people are in the family?|Five|Four|Six
?|What does the mother do?|She's a teacher|She's a student|They don't say
?|What pets do they have?|A dog and two cats|Two dogs and a cat|Only a cat

@ hungry|7|We're hungry!|我们 饿 了 ！|food
我 和 李华 都 饿 了 ， 我们 想 吃 面 。|Li Hua and I are both hungry, and we want noodles.
服务员 问 ： 你们 要 什么 ？|The waiter asks: What would you like?
我 说 ： 我 要 一 碗 面 ， 不 要 太 辣 。|I say: A bowl of noodles for me, not too spicy.
李华 说 ： 我 喜欢 辣 的 ！ 我 要 一 碗 辣 的 。|Li Hua says: I like it spicy! A spicy bowl for me.
我们 也 要 两 杯 茶 。|We'd also like two cups of tea.
¶
面 非常 好吃 。|The noodles are delicious.
李华 说 ： 太 辣 了 ！ 服务员 ， 我 要 一 杯 水 ！|Li Hua says: Too spicy! Waiter, a glass of water please!
吃 了 饭 ， 我 说 ： 服务员 ， 买单 ！|After the meal, I say: Waiter, the check please!
?|What do they order?|Noodles|Dumplings|Rice
?|What happens to Li Hua?|Her noodles are too spicy|She doesn't like tea|She isn't hungry
?|Who wanted the noodles not too spicy?|The narrator|Li Hua|The waiter

@ clothes|8|Buying clothes|买 衣服|shopping
我 想 买 衣服 。 这个 商店 卖 很 多 衣服 。|I want to buy some clothes. This shop sells lots of clothes.
我 很 喜欢 这 件 。|I really like this one.
我 问 ： 这 件 衣服 多少 钱 ？|I ask: How much is this one?
卖 衣服 的 人 说 ： 九 十 块 。|The seller says: Ninety yuan.
我 说 ： 太 贵 了 ！ 便宜 一点 吧 。|I say: That's too expensive! Make it a bit cheaper.
她 说 ： 八 十 块 ， 可以 吗 ？|She says: Eighty, OK?
我 说 ： 六 十 块 吧 。|I say: How about sixty?
她 说 ： 好 吧 ， 七 十 块 。|She says: Fine, seventy.
¶
我 问 ： 我 能 用 手机 买 吗 ？|I ask: Can I pay with my phone?
她 说 ： 可以 。|She says: Sure.
七 十 块 ， 不 贵 ！ 我 很 高兴 。|Seventy yuan, not expensive! I'm happy.
?|What price did the seller ask first?|90 yuan|80 yuan|70 yuan
?|What price did they agree on?|70 yuan|60 yuan|80 yuan
?|How does the narrator pay?|With their phone|In cash|They don't buy it

@ busy|9|Xiaoming is busy|小明 很 忙|school,hobbies
小明 是 学生 ， 他 每 天 都 很 忙 。|Xiaoming is a student, and he's busy every day.
他 每 天 早上 六 点 半 跑步 ， 晚上 看 书 。|He runs at half past six every morning and reads in the evening.
星期 六 和 星期 天 是 周末 。|Saturday and Sunday are the weekend.
周末 他 不 忙 ， 他 和 朋友 玩 游戏 、 看 电影 。|At the weekend he isn't busy: he plays games and watches movies with friends.
¶
今天 星期 五 。 李华 问 他 ： 你 明天 有 时间 吗 ？|Today is Friday. Li Hua asks him: Are you free tomorrow?
小明 说 ： 有 ！ 明天 早上 十 点 ， 可以 吗 ？|Xiaoming says: Yes! Tomorrow at ten in the morning, OK?
李华 说 ： 太 好 了 ！|Li Hua says: Great!
?|When does Xiaoming go running?|6:30 every morning|Every evening|At the weekend
?|What day is it today?|Friday|Saturday|Sunday
?|When will they meet?|Tomorrow at 10 a.m.|Tonight at 10|On Sunday

@ shanghai|10|I live in Shanghai|我 住 在 上海|people,school
我 叫 李华 ， 我 是 北京 人 ， 现在 住 在 上海 。|I'm Li Hua. I'm from Beijing, but now I live in Shanghai.
我 在 大学 工作 ， 我 是 老师 。|I work at a university; I'm a teacher.
我 的 学生 都 很 好 。|My students are all great.
¶
我 的 朋友 小明 在 公司 工作 ， 他 每 天 都 很 忙 。|My friend Xiaoming works at a company, and he's busy every day.
星期 五 晚上 我 去 他 家 ， 我们 吃 饺子 。|On Friday evening I go to his place, and we eat dumplings.
¶
我 爸爸 妈妈 都 在 北京 。|My mom and dad are both in Beijing.
周末 我 想 回 北京 。|At the weekend I'd like to go back to Beijing.
?|Where is Li Hua from?|Beijing|Shanghai|They don't say
?|Where does Xiaoming work?|At a company|At a university|At a school
?|What would Li Hua like to do at the weekend?|Go back to Beijing|Eat dumplings|Work

@ plans|11|Weekend plans|周末 你 打算 做 什么 ？|people,outdoors
今天 星期 五 。 小明 问 李华 ： 周末 你 打算 做 什么 ？|It's Friday. Xiaoming asks Li Hua: What are you planning to do this weekend?
李华 说 ： 我 还 不 知道 。 你 呢 ？|Li Hua says: I don't know yet. And you?
小明 说 ： 我 想 去 爬山 。 我们 一起 去 吧 ！|Xiaoming says: I want to go hiking. Let's go together!
李华 说 ： 我 不 太 喜欢 爬山 。 我们 去 看 电影 ， 怎么样 ？|Li Hua says: I don't really like hiking. How about we go see a movie?
小明 说 ： 好 ！ 星期 六 晚上 七 点 ， 可以 吗 ？|Xiaoming says: OK! Saturday at seven in the evening, all right?
李华 说 ： 可以 ， 星期 六 见 ！|Li Hua says: Sure, see you Saturday!
¶
星期 天 李华 问 小明 ： 你 觉得 电影 怎么样 ？|On Sunday Li Hua asks Xiaoming: What did you think of the movie?
小明 说 ： 我 觉得 非常 好 ， 我 还 想 再 看 一 遍 ！|Xiaoming says: I thought it was great. I want to see it again!
?|What did Xiaoming want to do at first?|Go hiking|See a movie|Stay home
?|When do they meet?|Saturday at 7 p.m.|Friday at 7 p.m.|Sunday morning
?|What did Xiaoming think of the movie?|He loved it|It was boring|He didn't go

@ yesterday|11|Yesterday|昨天|food,people
昨天 我 早上 七 点 起床 。|Yesterday I got up at seven in the morning.
我 喝 了 一 杯 咖啡 ， 没 吃 饭 。|I had a cup of coffee but didn't eat anything.
我 去 公司 工作 ， 工作 非常 忙 。|I went to the office, and work was really busy.
¶
晚上 我 很 饿 ， 我 做 了 饺子 。|In the evening I was very hungry, so I made dumplings.
我 吃 了 二 十 个 饺子 ！|I ate twenty dumplings!
我 晚上 十 一 点 睡觉 。|I went to bed at eleven.
¶
今天 星期 六 。 现在 已经 十 点 了 ， 我 还 没 起床 ！|Today is Saturday. It's already ten, and I'm still not up!
?|What did the narrator have in the morning?|A coffee|Dumplings|Tea and rice
?|How many dumplings did they eat?|20|10|12
?|What is the narrator doing at ten on Saturday?|Still in bed|Working|Making dumplings

@ hotel|12|To the hotel|去 酒店|travel
我 和 朋友 去 北京 旅行 。|My friend and I are traveling to Beijing.
我们 从 上海 坐 飞机 到 北京 。|We fly from Shanghai to Beijing.
到 了 机场 ， 我 问 一 个 人 ： 酒店 远 吗 ？|At the airport, I ask someone: Is the hotel far?
他 说 ： 很 远 。 你们 可以 坐 地铁 ， 也 可以 坐 出租车 。|He says: Very far. You can take the subway or a taxi.
出租车 很 贵 ， 地铁 很 便宜 。 我们 坐 地铁 吧 ！|Taxis are expensive and the subway is cheap. Let's take the subway!
¶
我们 到 了 。 酒店 在 哪儿 ？|We've arrived. Where's the hotel?
一 个 人 说 ： 往 左 走 ， 酒店 在 左边 ， 很 近 。|Someone says: Go left; the hotel's on the left, very close.
太 好 了 ！|Great!
?|How do they travel from Shanghai to Beijing?|By plane|By train|By taxi
?|Why do they take the subway?|It's cheaper|It's faster|There are no taxis
?|Where is the hotel?|On the left, close by|On the right|Next to the airport
`;
