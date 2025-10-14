import os

# == Non compliant Code Example

# ruleid: gci35-python-avoid-using-try-catch-statement-with-file-open-operation-in-try-block
path = "file.txt"
try:
    f = open(path)
    print(f.read())
except:
    print('No such file '+path)
finally:
    f.close()

# == Compliant Solution

# ok: gci35-python-avoid-using-try-catch-statement-with-file-open-operation-in-try-block
path = "file.txt"
if os.path.isfile(path):
  fh = open(path, 'r')
  print(fh.read())
  fh.close
