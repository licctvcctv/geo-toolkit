from django.urls import path
from . import views

urlpatterns = [
    path('register', views.register),
    path('login', views.login_view),
    path('logout', views.logout_view),
    path('me', views.me),
    path('thermometer/calculate', views.thermometer_calculate),
    path('thermometer/biotite', views.thermometer_biotite),
    path('mineral/identify', views.mineral_identify),
    path('ai/chat', views.ai_chat),
]
