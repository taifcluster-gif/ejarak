"""يعدّل AndroidManifest.xml بعد `cap add android`:
- يحذف صلاحية SCHEDULE_EXACT_ALARM التي يضيفها plugin الإشعارات. التطبيق يستخدم تنبيهات غير دقيقة
  (الدقة بالدقيقة ما تهم تذكير إيجار)، وبدون الصلاحية ما يحتاج Google Play نموذج تصريح خاص.
"""
import pathlib
import re
import sys

p = pathlib.Path('android/app/src/main/AndroidManifest.xml')
s = p.read_text(encoding='utf-8')

if 'xmlns:tools' not in s:
    s = s.replace('<manifest ', '<manifest xmlns:tools="http://schemas.android.com/tools" ', 1)

line = '<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" tools:node="remove" />'
if 'SCHEDULE_EXACT_ALARM' not in s:
    s = re.sub(r'</manifest>\s*$', '    ' + line + '\n</manifest>\n', s)

if 'SCHEDULE_EXACT_ALARM' not in s:
    sys.exit('فشل تعديل المانيفست')
p.write_text(s, encoding='utf-8')
print('manifest patched')
