import re
MESSAGE='8 caractères minimum, avec une majuscule, un chiffre et un caractère spécial.'
def validate(password):
    if not isinstance(password,str) or not 8<=len(password)<=256 or not re.search('[A-Z]',password) or not re.search('[0-9]',password) or not re.search(r'[!"#$%&\x27()*+,\-./:;<=>?@\[\]\\^_`{|}~]',password):raise ValueError(MESSAGE)
    return password
