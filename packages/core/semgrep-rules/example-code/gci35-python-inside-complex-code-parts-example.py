# Non-compliant examples
try:
    f = open(path)
    print(fh.read())
except:
    print('No such file '+path
finally:
    f.close()


# Compliant solutions
if os.path.isfile(path):
  fh = open(path, 'r')
  print(fh.read())
  fh.close
